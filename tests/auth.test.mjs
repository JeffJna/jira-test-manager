import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearerFrom, generateToken, hashToken, tokenMatches } from '../src/auth.js';

test('generateToken gera tokens únicos e longos', () => {
  const a = generateToken();
  assert.match(a, /^jtm_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, generateToken());
});

test('bearerFrom lê o header em qualquer caixa e formato', () => {
  assert.equal(bearerFrom({ authorization: ['Bearer abc'] }), 'abc');
  assert.equal(bearerFrom({ Authorization: 'bearer xyz ' }), 'xyz');
  assert.equal(bearerFrom({ authorization: ['Basic abc'] }), null);
  assert.equal(bearerFrom({}), null);
  assert.equal(bearerFrom(undefined), null);
});

test('tokenMatches compara pelo hash', () => {
  const token = generateToken();
  const stored = hashToken(token);
  assert.equal(tokenMatches(token, stored), true);
  assert.equal(tokenMatches(`${token}x`, stored), false);
  assert.equal(tokenMatches(null, stored), false);
  assert.equal(tokenMatches(token, null), false);
});
