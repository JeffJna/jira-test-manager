// Webtrigger de importação JUnit: o CI envia o XML via POST com um token Bearer.
//
//   curl -X POST "$URL?name=Build%20123" \
//     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/xml" \
//     --data-binary @report.xml

import api, { route } from '@forge/api';
import { randomUUID } from 'node:crypto';
import { bearerFrom, tokenMatches } from './auth.js';
import { groupByIssueKey, parseJUnit } from './junit.js';
import { createAutomatedRun } from './runs.js';
import { StepError } from './steps.js';
import { loadImportToken, saveRun } from './store.js';

export const TEST_ISSUE_TYPE_NAME = 'Teste';
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': ['application/json'] },
  body: JSON.stringify(body),
});

async function findTestIssue(key) {
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${key}?fields=issuetype`, { headers: { Accept: 'application/json' } });
  if (response.status === 404) {
    return { error: 'Issue não encontrado (ou o app não tem acesso a ele).' };
  }
  if (!response.ok) {
    return { error: `Falha ao consultar o issue (${response.status}).` };
  }
  const issue = await response.json();
  if (issue.fields?.issuetype?.name !== TEST_ISSUE_TYPE_NAME) {
    return { error: `O issue não é do tipo "${TEST_ISSUE_TYPE_NAME}".` };
  }
  return { id: String(issue.id) };
}

async function importReport(xml, label) {
  const { byKey, unmatched } = groupByIssueKey(parseJUnit(xml));
  const now = new Date().toISOString();
  const imported = [];

  // Sequencial de propósito: evita estourar limites de requisição do Jira.
  for (const [key, testcases] of byKey) {
    const issue = await findTestIssue(key);
    if (issue.error) {
      unmatched.push(...testcases.map((t) => ({ name: t.name, classname: t.classname, key, reason: issue.error })));
      continue;
    }
    const run = createAutomatedRun(testcases, { id: randomUUID(), now, label });
    await saveRun(issue.id, run);
    imported.push({ key, runId: run.id, status: run.status, testcases: testcases.length });
  }

  return { imported, unmatched };
}

export async function handler(request) {
  try {
    if (request.method !== 'POST') {
      return json(405, { error: 'Use POST com o XML JUnit no corpo.' });
    }

    const stored = await loadImportToken();
    if (!stored?.hash) {
      return json(503, { error: 'Importação não configurada: gere um token na página de administração do app.' });
    }
    if (!tokenMatches(bearerFrom(request.headers), stored.hash)) {
      return json(401, { error: 'Token ausente ou inválido.' });
    }

    const body = request.body ?? '';
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return json(413, { error: 'Relatório maior que 5 MB. Divida o envio.' });
    }

    const label = request.queryParameters?.name?.[0];
    const result = await importReport(body, label);
    return json(200, {
      imported: result.imported,
      unmatched: result.unmatched,
      summary: { tests: result.imported.length, unmatchedTestcases: result.unmatched.length },
    });
  } catch (error) {
    if (error instanceof StepError) {
      return json(400, { error: error.message });
    }
    console.error(error);
    return json(500, { error: 'Erro inesperado ao importar o relatório.' });
  }
}
