// Lógica pura das execuções de teste (sem dependências do Forge), para ser testável.
//
// Uma execução guarda uma cópia dos passos no momento em que foi criada. Assim, editar o
// teste depois não altera o histórico de execuções antigas.

import { StepError } from './steps.js';

export const STEP_STATUSES = ['TODO', 'PASSED', 'FAILED', 'BLOCKED'];
export const MAX_RUNS_PER_TEST = 100;
export const MAX_COMMENT_LENGTH = 1000;

export function computeRunStatus(results) {
  const statuses = results.map((result) => result.status);
  if (statuses.length === 0) return 'TODO';
  if (statuses.includes('FAILED')) return 'FAILED';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.every((status) => status === 'PASSED')) return 'PASSED';
  if (statuses.every((status) => status === 'TODO')) return 'TODO';
  return 'EXECUTING';
}

export function createRun(steps, { id, accountId, now }) {
  if (!steps.length) {
    throw new StepError('Adicione pelo menos um passo antes de executar o teste.');
  }
  const results = steps.map((step) => ({
    stepId: step.id,
    action: step.action,
    data: step.data,
    expected: step.expected,
    status: 'TODO',
    comment: '',
  }));
  return {
    id,
    createdAt: now,
    updatedAt: now,
    createdBy: accountId ?? null,
    status: computeRunStatus(results),
    results,
  };
}

// Execução criada a partir de resultados de CI: um resultado por testcase.
export function createAutomatedRun(testcases, { id, now, label, source = 'junit' }) {
  if (!testcases.length) {
    throw new StepError('Nenhum resultado automatizado para registrar.');
  }
  const results = testcases.map((testcase, index) => ({
    stepId: `auto-${index + 1}`,
    action: testcase.name || '(sem nome)',
    data: testcase.classname ?? '',
    expected: '',
    status: testcase.status,
    comment: truncate(testcase.message ?? '', MAX_COMMENT_LENGTH),
    executedBy: null,
    executedAt: now,
  }));
  return {
    id,
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    source,
    label: truncate(label ?? '', 200) || null,
    status: computeRunStatus(results),
    results,
  };
}

function truncate(text, max) {
  const trimmed = String(text).trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function recordStepResult(run, stepId, input, { now, accountId }) {
  const status = input?.status;
  if (!STEP_STATUSES.includes(status)) {
    throw new StepError('Status de passo inválido.');
  }
  const comment = input?.comment ?? '';
  if (typeof comment !== 'string') {
    throw new StepError('O comentário deve ser texto.');
  }
  const trimmed = comment.trim();
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new StepError(`O comentário excede ${MAX_COMMENT_LENGTH} caracteres.`);
  }
  const index = run.results.findIndex((result) => result.stepId === stepId);
  if (index === -1) {
    throw new StepError('Passo não encontrado nesta execução.');
  }
  const results = [...run.results];
  results[index] = {
    ...results[index],
    status,
    comment: trimmed,
    executedBy: accountId ?? null,
    executedAt: now,
  };
  return { ...run, results, updatedAt: now, status: computeRunStatus(results) };
}

export function summarizeRun(run) {
  const counts = Object.fromEntries(STEP_STATUSES.map((status) => [status, 0]));
  for (const result of run.results) counts[result.status] += 1;
  return {
    id: run.id,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    createdBy: run.createdBy,
    source: run.source ?? 'manual',
    label: run.label ?? null,
    status: run.status,
    counts,
  };
}

// Atualiza o índice (mais recente primeiro) e devolve os ids que saíram por excesso.
export function upsertSummary(index, summary, max = MAX_RUNS_PER_TEST) {
  const others = index.filter((item) => item.id !== summary.id);
  const existing = others.length !== index.length;
  const next = existing
    ? index.map((item) => (item.id === summary.id ? summary : item))
    : [summary, ...index];
  return { index: next.slice(0, max), evicted: next.slice(max).map((item) => item.id) };
}

export function removeSummary(index, runId) {
  if (!index.some((item) => item.id === runId)) {
    throw new StepError('Execução não encontrada.');
  }
  return index.filter((item) => item.id !== runId);
}
