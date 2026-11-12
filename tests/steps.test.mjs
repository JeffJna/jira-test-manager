import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addStep,
  MAX_FIELD_LENGTH,
  moveStep,
  removeStep,
  StepError,
  updateStep,
} from '../src/steps.js';

const base = [
  { id: 'a', action: 'Abrir login', data: '', expected: 'Tela exibida' },
  { id: 'b', action: 'Digitar senha', data: 'user/123', expected: '' },
];

test('addStep apara espaços e adiciona no fim', () => {
  const result = addStep(base, { action: '  Clicar em entrar ', expected: 'Home' }, 'c');
  assert.deepEqual(result.at(-1), { id: 'c', action: 'Clicar em entrar', data: '', expected: 'Home' });
  assert.equal(base.length, 2, 'não muta a lista original');
});

test('addStep exige ação', () => {
  assert.throws(() => addStep(base, { action: '   ' }, 'c'), StepError);
});

test('addStep rejeita campos longos ou de tipo errado', () => {
  assert.throws(() => addStep(base, { action: 'x'.repeat(MAX_FIELD_LENGTH + 1) }, 'c'), StepError);
  assert.throws(() => addStep(base, { action: 42 }, 'c'), StepError);
  assert.throws(() => addStep(base, null, 'c'), StepError);
});

test('updateStep substitui os campos e mantém o id', () => {
  const result = updateStep(base, 'b', { action: 'Digitar senha errada', expected: 'Erro' });
  assert.deepEqual(result[1], { id: 'b', action: 'Digitar senha errada', data: '', expected: 'Erro' });
});

test('removeStep e passo inexistente', () => {
  assert.deepEqual(removeStep(base, 'a').map((s) => s.id), ['b']);
  assert.throws(() => removeStep(base, 'zzz'), StepError);
});

test('moveStep troca posições e ignora as bordas', () => {
  assert.deepEqual(moveStep(base, 'b', 'up').map((s) => s.id), ['b', 'a']);
  assert.equal(moveStep(base, 'a', 'up'), base);
  assert.equal(moveStep(base, 'b', 'down'), base);
  assert.throws(() => moveStep(base, 'a', 'sideways'), StepError);
});
