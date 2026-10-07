import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users, refreshTokens, exercises, trainingScheduleHistory } from '../../db/schema.js';
import { DEFAULT_EXERCISES } from '../../db/defaultExercises.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTtlToDate,
} from '../../utils/tokens.js';

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function registerUser(email: string, password: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    throw new AuthError('email_taken', 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db.insert(users).values({ email, passwordHash }).returning();

  // Seed one schedule-history row from day one, so the consistency calendar
  // has something to judge past dates against even if the user never opens
  // Settings to change the (default) schedule.
  await db.insert(trainingScheduleHistory).values({
    userId: user.id,
    trainingDays: user.trainingDays,
    effectiveFrom: user.createdAt.toISOString().slice(0, 10),
  });

  // Seed the default exercise list for the new user so they have something
  // to log against right away.
  await db.insert(exercises).values(
    DEFAULT_EXERCISES.map((ex) => ({
      userId: user.id,
      name: ex.name,
      equipment: ex.equipment,
      category: ex.category,
      repRangeMin: ex.repRangeMin,
      repRangeMax: ex.repRangeMax,
      weightStepKg: ex.weightStepKg,
    })),
  );

  return user;
}

export async function validateCredentials(email: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    throw new AuthError('invalid_credentials', 'Wrong email or password');
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    throw new AuthError('invalid_credentials', 'Wrong email or password');
  }
  return user;
}

export async function issueTokenPair(user: { id: string; email: string }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = refreshTtlToDate();

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

const ROTATION_GRACE_MS = 60_000;

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken);

  const record = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
  });

  // Grace window for an already-rotated token: on a flaky mobile connection
  // the server can rotate while the response (with the new cookie) never
  // reaches the phone, leaving it holding the old token. Without this the
  // session would be dead after one lost response.
  const revokedTooLongAgo =
    record?.revokedAt != null && Date.now() - record.revokedAt.getTime() > ROTATION_GRACE_MS;

  if (!record || revokedTooLongAgo || record.expiresAt.getTime() < Date.now()) {
    throw new AuthError('invalid_refresh_token', 'Session expired, please log in again');
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, record.userId) });
  if (!user) {
    throw new AuthError('invalid_refresh_token', 'Session expired, please log in again');
  }

  // Rotate: revoke the old token, issue a brand new pair.
  if (!record.revokedAt) {
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, record.id));
  }

  return issueTokenPair(user);
}

// Logout deletes the row instead of setting revokedAt, so the rotation grace
// window above can never revive a token the user explicitly logged out of.
export async function revokeRefreshToken(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken);
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}
