import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepError } from '../src/steps.js';
import { extractIssueKeys, groupByIssueKey, MAX_ISSUES_PER_IMPORT, parseJUnit } from '../src/junit.js';
import { createAutomatedRun, MAX_COMMENT_LENGTH, summarizeRun } from '../src/runs.js';

const REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="auth" tests="4">
    <testcase name="login ok [QA-1]" classname="auth.LoginTest" time="0.12"/>
    <testcase name="login senha errada" classname="auth.LoginTest" time="0.3">
      <properties><property name="test_key" value="qa-2, QA-3"/></properties>
      <failure message="expected 401 but was 500">stack trace aqui</failure>
    </testcase>
    <testcase name="logout" classname="auth.QA-1.LogoutTest">
      <skipped message="flaky"/>
    </testcase>
    <testcase name="sem chave" classname="auth.Misc">
      <error message="boom"/>
    </testcase>
  </testsuite>
</testsuites>`;

test('parseJUnit lê status, mensagens e propriedades', () => {
  const cases = parseJUnit(REPORT);
  assert.equal(cases.length, 4);
  assert.deepEqual(
    cases.map((c) => c.status),
    ['PASSED', 'FAILED', 'TODO', 'FAILED'],
  );
  assert.equal(cases[0].time, 0.12);
  assert.match(cases[1].message, /expected 401 but was 500/);
  assert.match(cases[1].message, /stack trace aqui/);
  assert.match(cases[2].message, /Ignorado \(skipped\): flaky/);
  assert.equal(cases[1].properties.test_key, 'qa-2, QA-3');
});

test('parseJUnit aceita <testsuite> como raiz e suites aninhadas', () => {
  const single = parseJUnit('<testsuite name="s"><testcase name="a QA-9"/></testsuite>');
  assert.equal(single.length, 1);
  const nested = parseJUnit(
    '<testsuites><testsuite name="p"><testsuite name="c"><testcase name="x QA-9"/></testsuite></testsuite></testsuites>',
  );
  assert.equal(nested.length, 1);
  assert.equal(nested[0].classname, 'c');
});

test('parseJUnit rejeita entrada vazia ou sem suites', () => {
  assert.throws(() => parseJUnit(''), StepError);
  assert.throws(() => parseJUnit('<foo/>'), StepError);
});

test('extractIssueKeys prioriza a propriedade e evita falsos positivos', () => {
  assert.deepEqual(extractIssueKeys({ name: 'x', classname: '', properties: { test_key: 'qa-2, QA-3' } }), ['QA-2', 'QA-3']);
  assert.deepEqual(extractIssueKeys({ name: 'test_QA-12_login', classname: '', properties: {} }), ['QA-12']);
  assert.deepEqual(extractIssueKeys({ name: 'utf-8 X-1 QA-0', classname: '', properties: {} }), []);
  assert.deepEqual(extractIssueKeys({ name: 'QA-1 e QA-1 de novo', classname: '', properties: {} }), ['QA-1']);
});

test('groupByIssueKey agrupa por chave e separa os sem chave', () => {
  const { byKey, unmatched } = groupByIssueKey(parseJUnit(REPORT));
  assert.deepEqual([...byKey.keys()].sort(), ['QA-1', 'QA-2', 'QA-3']);
  assert.equal(byKey.get('QA-1').length, 2);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].name, 'sem chave');
});

test('groupByIssueKey limita o número de testes por importação', () => {
  const cases = Array.from({ length: MAX_ISSUES_PER_IMPORT + 1 }, (_, i) => ({
    name: `t QA-${i + 1}`,
    classname: '',
    properties: {},
  }));
  assert.throws(() => groupByIssueKey(cases), StepError);
});

test('createAutomatedRun gera um resultado por testcase', () => {
  const { byKey } = groupByIssueKey(parseJUnit(REPORT));
  const run = createAutomatedRun(byKey.get('QA-1'), { id: 'r', now: 'T', label: 'Build #7' });
  assert.equal(run.source, 'junit');
  assert.equal(run.label, 'Build #7');
  assert.equal(run.status, 'EXECUTING'); // um passou, um ignorado
  assert.deepEqual(run.results.map((r) => r.action), ['login ok [QA-1]', 'logout']);
  const summary = summarizeRun(run);
  assert.deepEqual([summary.source, summary.label], ['junit', 'Build #7']);
});

test('createAutomatedRun trunca mensagens longas e exige testcases', () => {
  const run = createAutomatedRun(
    [{ name: 'a', classname: '', status: 'FAILED', message: 'x'.repeat(5000) }],
    { id: 'r', now: 'T' },
  );
  assert.equal(run.results[0].comment.length, MAX_COMMENT_LENGTH);
  assert.equal(run.label, null);
  assert.throws(() => createAutomatedRun([], { id: 'r', now: 'T' }), StepError);
});
