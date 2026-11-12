import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepError } from '../src/steps.js';
import {
  computeRunStatus,
  createRun,
  MAX_COMMENT_LENGTH,
  recordStepResult,
  removeSummary,
  summarizeRun,
  upsertSummary,
} from '../src/runs.js';

const steps = [
  { id: 's1', action: 'Abrir login', data: '', expected: 'Tela exibida' },
  { id: 's2', action: 'Entrar', data: 'user/123', expected: 'Home' },
];
const meta = { now: '2026-11-12T10:00:00.000Z', accountId: 'acc-1' };

const status = (...list) => list.map((s) => ({ status: s }));

test('computeRunStatus segue a prioridade falhou > bloqueado > passou', () => {
  assert.equal(computeRunStatus([]), 'TODO');
  assert.equal(computeRunStatus(status('TODO', 'TODO')), 'TODO');
  assert.equal(computeRunStatus(status('PASSED', 'TODO')), 'EXECUTING');
  assert.equal(computeRunStatus(status('PASSED', 'PASSED')), 'PASSED');
  assert.equal(computeRunStatus(status('PASSED', 'BLOCKED', 'TODO')), 'BLOCKED');
  assert.equal(computeRunStatus(status('BLOCKED', 'FAILED')), 'FAILED');
});

test('createRun copia os passos e começa pendente', () => {
  const run = createRun(steps, { id: 'r1', ...meta });
  assert.equal(run.status, 'TODO');
  assert.equal(run.createdBy, 'acc-1');
  assert.deepEqual(run.results.map((r) => [r.stepId, r.action, r.status]), [
    ['s1', 'Abrir login', 'TODO'],
    ['s2', 'Entrar', 'TODO'],
  ]);
  assert.throws(() => createRun([], { id: 'r2', ...meta }), StepError);
});

test('recordStepResult atualiza o passo e o status geral sem mutar', () => {
  const run = createRun(steps, { id: 'r1', ...meta });
  const later = { now: '2026-11-12T11:00:00.000Z', accountId: 'acc-2' };
  const partial = recordStepResult(run, 's1', { status: 'PASSED', comment: '  ok  ' }, later);
  assert.equal(partial.status, 'EXECUTING');
  assert.deepEqual(
    { s: partial.results[0].status, c: partial.results[0].comment, by: partial.results[0].executedBy },
    { s: 'PASSED', c: 'ok', by: 'acc-2' },
  );
  assert.equal(partial.updatedAt, later.now);
  assert.equal(run.results[0].status, 'TODO', 'original intacto');

  const failed = recordStepResult(partial, 's2', { status: 'FAILED' }, later);
  assert.equal(failed.status, 'FAILED');
});

test('recordStepResult valida entrada', () => {
  const run = createRun(steps, { id: 'r1', ...meta });
  assert.throws(() => recordStepResult(run, 's1', { status: 'MAYBE' }, meta), StepError);
  assert.throws(() => recordStepResult(run, 'nope', { status: 'PASSED' }, meta), StepError);
  assert.throws(
    () => recordStepResult(run, 's1', { status: 'PASSED', comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }, meta),
    StepError,
  );
});

test('summarizeRun conta passos por status', () => {
  let run = createRun(steps, { id: 'r1', ...meta });
  run = recordStepResult(run, 's1', { status: 'PASSED' }, meta);
  assert.deepEqual(summarizeRun(run).counts, { TODO: 1, PASSED: 1, FAILED: 0, BLOCKED: 0 });
});

test('upsertSummary insere no topo, atualiza no lugar e corta o excesso', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  let result = upsertSummary([], a, 2);
  result = upsertSummary(result.index, b, 2);
  assert.deepEqual(result.index.map((x) => x.id), ['b', 'a']);

  const updated = upsertSummary(result.index, { id: 'a', status: 'PASSED' }, 2);
  assert.deepEqual(updated.index.map((x) => x.id), ['b', 'a']);
  assert.equal(updated.index[1].status, 'PASSED');
  assert.deepEqual(updated.evicted, []);

  const overflow = upsertSummary(updated.index, { id: 'c' }, 2);
  assert.deepEqual(overflow.index.map((x) => x.id), ['c', 'b']);
  assert.deepEqual(overflow.evicted, ['a']);
});

test('removeSummary remove ou falha se não existir', () => {
  assert.deepEqual(removeSummary([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
  assert.throws(() => removeSummary([], 'a'), StepError);
});
