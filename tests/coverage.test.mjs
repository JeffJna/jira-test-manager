import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE_LINK_TYPE, coverageCounts, coverageStatus, linkedIssues } from '../src/coverage.js';

const issue = (id, key, type, summary = `Resumo ${key}`) => ({
  id,
  key,
  fields: { summary, issuetype: { name: type }, status: { name: 'Em andamento', statusCategory: { key: 'indeterminate' } } },
});
const link = (typeName, side, other) => ({ type: { name: typeName }, [side]: other });

const storyLinks = [
  link(COVERAGE_LINK_TYPE.name, 'inwardIssue', issue('12', 'QA-12', 'Teste')),
  link(COVERAGE_LINK_TYPE.name, 'outwardIssue', issue('3', 'QA-3', 'Teste')), // vinculado ao contrário
  link(COVERAGE_LINK_TYPE.name, 'inwardIssue', issue('12', 'QA-12', 'Teste')), // duplicado
  link('Relates', 'inwardIssue', issue('20', 'QA-20', 'Teste')), // outro tipo de vínculo
  link(COVERAGE_LINK_TYPE.name, 'inwardIssue', issue('30', 'QA-30', 'Story')), // não é teste
];

test('linkedIssues na story: só testes, pelo tipo certo, sem duplicar, ordenado', () => {
  const tests = linkedIssues(storyLinks, { wantTests: true, testTypeName: 'Teste' });
  assert.deepEqual(tests.map((t) => t.key), ['QA-3', 'QA-12']);
  assert.deepEqual(tests[1], {
    id: '12',
    key: 'QA-12',
    summary: 'Resumo QA-12',
    statusName: 'Em andamento',
    statusCategory: 'indeterminate',
  });
});

test('linkedIssues no teste: só requisitos (não-testes)', () => {
  const reqs = linkedIssues(storyLinks, { wantTests: false, testTypeName: 'Teste' });
  assert.deepEqual(reqs.map((r) => r.key), ['QA-30']);
});

test('linkedIssues tolera dados ausentes', () => {
  assert.deepEqual(linkedIssues(undefined, { wantTests: true, testTypeName: 'Teste' }), []);
  assert.deepEqual(linkedIssues([{}, { type: { name: COVERAGE_LINK_TYPE.name } }], { wantTests: true, testTypeName: 'Teste' }), []);
});

const run = (status) => ({ lastRun: status ? { status } : null });

test('coverageStatus segue a prioridade', () => {
  assert.equal(coverageStatus([]), 'NOT_COVERED');
  assert.equal(coverageStatus([run('PASSED'), run('PASSED')]), 'PASSED');
  assert.equal(coverageStatus([run('PASSED'), run(null)]), 'NOT_RUN');
  assert.equal(coverageStatus([run('PASSED'), run('EXECUTING')]), 'NOT_RUN');
  assert.equal(coverageStatus([run('PASSED'), run('BLOCKED'), run(null)]), 'BLOCKED');
  assert.equal(coverageStatus([run('BLOCKED'), run('FAILED')]), 'FAILED');
});

test('coverageCounts agrupa pendentes/em andamento como não executados', () => {
  assert.deepEqual(coverageCounts([run('PASSED'), run('FAILED'), run('TODO'), run(null), run('BLOCKED')]), {
    total: 5,
    PASSED: 1,
    FAILED: 1,
    BLOCKED: 1,
    NOT_RUN: 2,
  });
});
