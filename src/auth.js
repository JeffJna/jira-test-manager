// Token de importação: gerado uma vez e mostrado ao admin; só o hash fica armazenado.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = 'jtm_';

export function generateToken() {
  return `${PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function bearerFrom(headers) {
  const entry = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === 'authorization');
  const value = Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1];
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value ?? '');
  return match ? match[1] : null;
}

export function tokenMatches(token, storedHash) {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
