// Acesso ao Forge KVS, compartilhado pelo resolver (UI) e pelo webtrigger (CI).
//
// steps:<issueId>         passos do teste
// runs:<issueId>          índice com o resumo de cada execução (mais recente primeiro)
// run:<issueId>:<runId>   execução completa, com a cópia dos passos e os resultados
// config:junit-token      hash SHA-256 do token de importação JUnit

import { kvs } from '@forge/kvs';
import { StepError } from './steps.js';
import { summarizeRun, upsertSummary } from './runs.js';

const stepsKey = (issueId) => `steps:${issueId}`;
const runsIndexKey = (issueId) => `runs:${issueId}`;
const runKey = (issueId, runId) => `run:${issueId}:${runId}`;
const IMPORT_TOKEN_KEY = 'config:junit-token';

export async function loadSteps(issueId) {
  return (await kvs.get(stepsKey(issueId))) ?? [];
}

export async function saveSteps(issueId, steps) {
  await kvs.set(stepsKey(issueId), steps);
}

export async function loadRunsIndex(issueId) {
  return (await kvs.get(runsIndexKey(issueId))) ?? [];
}

export async function loadRun(issueId, runId) {
  if (typeof runId !== 'string' || !runId) {
    throw new StepError('Execução inválida.');
  }
  const run = await kvs.get(runKey(issueId, runId));
  if (!run) {
    throw new StepError('Execução não encontrada.');
  }
  return run;
}

// Salva a execução, atualiza o índice e apaga as execuções que saíram do limite.
export async function saveRun(issueId, run) {
  await kvs.set(runKey(issueId, run.id), run);
  const { index, evicted } = upsertSummary(await loadRunsIndex(issueId), summarizeRun(run));
  await kvs.set(runsIndexKey(issueId), index);
  await Promise.all(evicted.map((runId) => kvs.delete(runKey(issueId, runId))));
  return index;
}

export async function deleteRun(issueId, runId, nextIndex) {
  await kvs.set(runsIndexKey(issueId), nextIndex);
  await kvs.delete(runKey(issueId, runId));
}

export async function loadImportToken() {
  return (await kvs.get(IMPORT_TOKEN_KEY)) ?? null;
}

export async function saveImportToken(record) {
  await kvs.set(IMPORT_TOKEN_KEY, record);
}
