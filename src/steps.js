// Lógica pura dos passos de teste (sem dependências do Forge), para ser testável.

export const MAX_STEPS = 200;
export const MAX_FIELD_LENGTH = 2000;

const FIELDS = ['action', 'data', 'expected'];

export class StepError extends Error {}

export function normalizeInput(input) {
  if (!input || typeof input !== 'object') {
    throw new StepError('Dados do passo inválidos.');
  }
  const out = {};
  for (const field of FIELDS) {
    const value = input[field] ?? '';
    if (typeof value !== 'string') {
      throw new StepError(`Campo "${field}" deve ser texto.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_FIELD_LENGTH) {
      throw new StepError(`Campo "${field}" excede ${MAX_FIELD_LENGTH} caracteres.`);
    }
    out[field] = trimmed;
  }
  if (!out.action) {
    throw new StepError('A ação do passo é obrigatória.');
  }
  return out;
}

export function addStep(steps, input, id) {
  if (steps.length >= MAX_STEPS) {
    throw new StepError(`Limite de ${MAX_STEPS} passos atingido.`);
  }
  return [...steps, { id, ...normalizeInput(input) }];
}

function indexOf(steps, id) {
  const index = steps.findIndex((step) => step.id === id);
  if (index === -1) {
    throw new StepError('Passo não encontrado.');
  }
  return index;
}

export function updateStep(steps, id, input) {
  const index = indexOf(steps, id);
  const next = [...steps];
  next[index] = { id, ...normalizeInput(input) };
  return next;
}

export function removeStep(steps, id) {
  indexOf(steps, id);
  return steps.filter((step) => step.id !== id);
}

export function moveStep(steps, id, direction) {
  const index = indexOf(steps, id);
  const target = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : NaN;
  if (Number.isNaN(target)) {
    throw new StepError('Direção inválida.');
  }
  if (target < 0 || target >= steps.length) {
    return steps;
  }
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
