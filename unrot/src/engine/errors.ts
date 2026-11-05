// Errors the API returns, and small input validators.
//
// Every message is written for the person using the app: what went wrong and
// what to do about it.

import { isISODate, parseHM, type ISODate } from '../shared/dates';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request') => new ApiError(400, code, message);
export const unauthorized = (message = 'Please log in again.') => new ApiError(401, 'unauthorized', message);
export const forbidden = (message: string) => new ApiError(403, 'forbidden', message);
export const notFound = (message: string) => new ApiError(404, 'not_found', message);
export const conflict = (message: string, code = 'conflict') => new ApiError(409, code, message);
export const tooMany = (message: string) => new ApiError(429, 'rate_limited', message);

export type Body = Record<string, unknown>;

export function asBody(v: unknown): Body {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw badRequest('Send a JSON object.');
  return v as Body;
}

export function str(v: unknown, label: string, opts: { min?: number; max: number }): string {
  if (typeof v !== 'string') throw badRequest(`${label} is missing.`);
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length < (opts.min ?? 1)) throw badRequest(opts.min && opts.min > 1 ? `${label} needs at least ${opts.min} characters.` : `${label} is missing.`);
  if (s.length > opts.max) throw badRequest(`${label} can be at most ${opts.max} characters.`);
  return s;
}

export function int(v: unknown, label: string, opts: { min: number; max: number }): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) throw badRequest(`${label} must be a whole number.`);
  if (n < opts.min || n > opts.max) throw badRequest(`${label} must be between ${opts.min} and ${opts.max}.`);
  return n;
}

export function optInt(v: unknown, label: string, opts: { min: number; max: number }): number | null {
  if (v === undefined || v === null || v === '') return null;
  return int(v, label, opts);
}

export function bool(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw badRequest(`${label} must be true or false.`);
  return v;
}

export function optBool(v: unknown, label: string): boolean | null {
  if (v === undefined || v === null) return null;
  return bool(v, label);
}

export function oneOf<T extends string | number>(v: unknown, label: string, values: readonly T[]): T {
  if (!values.includes(v as T)) throw badRequest(`${label} must be one of: ${values.join(', ')}.`);
  return v as T;
}

export function date(v: unknown, label: string): ISODate {
  if (!isISODate(v)) throw badRequest(`${label} must be a date like 2026-11-05.`);
  return v;
}

export function hm(v: unknown, label: string): string {
  if (parseHM(v) === null) throw badRequest(`${label} must be a time like 22:30.`);
  return v as string;
}

export function optHm(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  return hm(v, label);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(v: unknown): string {
  if (typeof v !== 'string' || !EMAIL.test(v.trim()) || v.trim().length > 120) {
    throw badRequest('Enter a valid email address.');
  }
  return v.trim().toLowerCase();
}
