import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AccessTokenPayload = {
  sub: string; // user id
  email: string;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// Refresh tokens are opaque random strings. We store only a SHA-256 hash of
// the token in the database, so a leaked DB dump can't be replayed directly.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

// Personal access tokens: the prefix tells them apart from JWTs (which
// always contain dots) at a glance - in authenticate() and in a config file.
export const PAT_PREFIX = 'mygym_pat_';

export function generatePersonalAccessToken(): string {
  return PAT_PREFIX + crypto.randomBytes(32).toString('hex');
}

// Secret part of a calendar feed URL. Not a credential for the API - it only
// opens the read-only .ics feed with the training schedule.
export const CALENDAR_TOKEN_PREFIX = 'mygym_cal_';

export function generateCalendarFeedToken(): string {
  return CALENDAR_TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
}

// Also used for personal access and calendar feed tokens - same "store only a hash" rule.
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTtlToDate(): Date {
  const ttl = env.JWT_REFRESH_TTL;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  const now = Date.now();
  if (!match) {
    // fallback: 30 days
    return new Date(now + 30 * 24 * 60 * 60 * 1000);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(now + value * unitMs[unit]);
}
