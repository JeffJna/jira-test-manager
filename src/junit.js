// Leitura de relatórios JUnit XML e vínculo dos testcases com issues "Teste" do Jira.
//
// Um testcase é vinculado a um ou mais issues pela chave Jira (ex.: QA-12), procurada em:
//   1. <property name="test_key" value="QA-12,QA-13"/> dentro do testcase; ou
//   2. no nome ou no classname do testcase (ex.: "test_login [QA-12]").

import { XMLParser } from 'fast-xml-parser';
import { StepError } from './steps.js';

export const MAX_TESTCASES = 5000;
export const MAX_ISSUES_PER_IMPORT = 50;
export const KEY_PROPERTY_NAMES = ['test_key', 'test_keys', 'jira', 'jira_key'];

const ISSUE_KEY = /(?<![A-Za-z0-9])([A-Z][A-Z0-9_]+-[1-9]\d*)(?!\d)/g;

const ALWAYS_ARRAY = new Set(['testsuite', 'testcase', 'property', 'failure', 'error', 'skipped']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ALWAYS_ARRAY.has(name),
});

const asText = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  return [node.message, node['#text']].filter(Boolean).join('\n');
};

function collectSuites(node, out = []) {
  for (const suite of node?.testsuite ?? []) {
    out.push(suite);
    collectSuites(suite, out); // suites aninhadas
  }
  return out;
}

function caseStatus(testcase) {
  const failure = testcase.failure?.[0] ?? testcase.error?.[0];
  if (failure !== undefined) {
    return { status: 'FAILED', message: asText(failure) || 'Falhou' };
  }
  if (testcase.skipped !== undefined) {
    return { status: 'TODO', message: `Ignorado (skipped)${asText(testcase.skipped[0]) ? `: ${asText(testcase.skipped[0])}` : ''}` };
  }
  return { status: 'PASSED', message: '' };
}

export function parseJUnit(xml) {
  if (typeof xml !== 'string' || !xml.trim()) {
    throw new StepError('Corpo vazio: envie o XML do relatório JUnit.');
  }
  let doc;
  try {
    doc = parser.parse(xml, true);
  } catch (error) {
    throw new StepError(`XML inválido: ${error.message}`);
  }
  // Raiz pode ser <testsuites> ou um <testsuite> único.
  const root = doc.testsuites ?? doc;
  const suites = collectSuites(root);
  if (suites.length === 0) {
    throw new StepError('Nenhum <testsuite> encontrado no XML.');
  }

  const cases = [];
  for (const suite of suites) {
    for (const testcase of suite.testcase ?? []) {
      const properties = Object.fromEntries(
        (testcase.properties?.property ?? []).map((p) => [String(p.name).toLowerCase(), String(p.value ?? asText(p))]),
      );
      cases.push({
        name: String(testcase.name ?? ''),
        classname: String(testcase.classname ?? suite.name ?? ''),
        time: Number.parseFloat(testcase.time) || 0,
        properties,
        ...caseStatus(testcase),
      });
      if (cases.length > MAX_TESTCASES) {
        throw new StepError(`O relatório excede ${MAX_TESTCASES} testcases.`);
      }
    }
  }
  return cases;
}

export function extractIssueKeys(testcase) {
  for (const name of KEY_PROPERTY_NAMES) {
    const value = testcase.properties?.[name];
    if (value) return [...new Set(value.toUpperCase().match(ISSUE_KEY) ?? [])];
  }
  const text = `${testcase.name} ${testcase.classname}`;
  return [...new Set(text.match(ISSUE_KEY) ?? [])];
}

// Agrupa os testcases por chave de issue. Testcases sem chave vão para `unmatched`.
export function groupByIssueKey(cases) {
  const byKey = new Map();
  const unmatched = [];
  for (const testcase of cases) {
    const keys = extractIssueKeys(testcase);
    if (keys.length === 0) {
      unmatched.push({ name: testcase.name, classname: testcase.classname, reason: 'Nenhuma chave Jira encontrada.' });
      continue;
    }
    for (const key of keys) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(testcase);
    }
  }
  if (byKey.size > MAX_ISSUES_PER_IMPORT) {
    throw new StepError(
      `O relatório referencia ${byKey.size} testes; o limite por importação é ${MAX_ISSUES_PER_IMPORT}. Divida o envio.`,
    );
  }
  return { byKey, unmatched };
}
