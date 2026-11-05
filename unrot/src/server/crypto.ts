// Real crypto for the server: scrypt password hashes and hashed session tokens.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { EngineCrypto } from '../engine';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export const nodeCrypto: EngineCrypto = {
  hashPassword(password) {
    const salt = randomBytes(16);
    const key = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
  },
  verifyPassword(password, stored) {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string];
    const expected = Buffer.from(keyB64, 'base64');
    const key = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  },
  hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
  },
  randomHex(bytes) {
    return randomBytes(bytes).toString('hex');
  },
};
