import { and, eq, lt, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users, refreshTokens, exercises, trainingScheduleHistory } from '../../db/schema.js';
import { DEFAULT_EXERCISES, DEFAULT_BAR_KG } from '../../db/defaultExercises.js';
import { DEMO_EMAIL } from '../template/demo.service.js';
import { seedStarterData } from '../template/template.service.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { isUniqueViolation } from '../../utils/pgErrors.js';
import type { GoogleProfile } from './google.client.js';
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


// Creates a user with everything a fresh account starts with. Shared by
// password registration and the first Google sign-in.
async function createUserWithDefaults(values: typeof users.$inferInsert) {
  // One transaction: if seeding the schedule/exercises fails, the user row
  // is rolled back too - otherwise we'd leave a half-created account that
  // can log in but has no exercises and blocks re-registration.
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values(values).returning();

    // Seed one schedule-history row from day one, so the consistency calendar
    // has something to judge past dates against even if the user never opens
    // Settings to change the (default) schedule.
    await tx.insert(trainingScheduleHistory).values({
      userId: user.id,
      trainingDays: user.trainingDays,
      effectiveFrom: user.createdAt.toISOString().slice(0, 10),
    });

    // Seed the default exercise list for the new user so they have something
    // to log against right away.
    await tx.insert(exercises).values(
      DEFAULT_EXERCISES.map((ex) => ({
        userId: user.id,
        name: ex.name,
        equipment: ex.equipment,
        category: ex.category,
        repRangeMin: ex.repRangeMin,
        repRangeMax: ex.repRangeMax,
        weightStepKg: ex.weightStepKg,
        unilateral: ex.limb != null,
        limb: ex.limb ?? null,
        defaultBarKg: ex.equipment === 'barbell' ? DEFAULT_BAR_KG : null,
      })),
    );

    // The template account's programs and latest workouts (as samples), so
    // the journal, calendar and progress pages aren't empty on day one.
    await seedStarterData(tx, user.id);

    return user;
  });
}

export async function registerUser(email: string, password: string) {
  // Reserved for the shared demo account, which is created on first use.
  if (email.toLowerCase() === DEMO_EMAIL) {
    throw new AuthError('email_taken', 'An account with this email already exists');
  }
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    throw new AuthError('email_taken', 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);

  try {
    return await createUserWithDefaults({ email, passwordHash });
  } catch (err) {
    // Two concurrent sign-ups with the same email both pass the findFirst
    // check above; the unique index on lower(email) stops the second one.
    if (isUniqueViolation(err)) {
      throw new AuthError('email_taken', 'An account with this email already exists');
    }
    throw err;
  }
}

function findUserForGoogle(profile: GoogleProfile) {
  return db.query.users.findFirst({
    where: or(eq(users.googleSub, profile.sub), sql`lower(${users.email}) = lower(${profile.email})`),
    // A row already bound to this Google account wins over a same-email one.
    orderBy: sql`${users.googleSub} = ${profile.sub} desc nulls last`,
  });
}

// Signs in (or up) with an already verified Google profile:
//  1. an account already linked to this Google id;
//  2. otherwise an existing account with the same email - Google is linked
//     to it and its password keeps working (the user's choice, see CLAUDE.md);
//  3. otherwise a brand-new account without a password.
export async function loginWithGoogle(profile: GoogleProfile) {
  // Linking by email is only safe when Google vouches for the address.
  if (!profile.emailVerified) {
    throw new AuthError('google_email_unverified', 'Google has not verified this email');
  }

  const existing = await findUserForGoogle(profile);
  if (existing) {
    if (existing.googleSub === profile.sub) return existing;
    if (existing.googleSub) {
      // The email's account is linked to a *different* Google account.
      throw new AuthError('google_account_mismatch', 'This email is linked to another Google account');
    }
    return db.transaction(async (tx) => {
      const [linked] = await tx
        .update(users)
        .set({ googleSub: profile.sub })
        .where(eq(users.id, existing.id))
        .returning();
      // Narrows the accepted pre-registration risk (someone signed up with
      // this email + their own password before the real owner): whoever was
      // logged in before the owner proved the address via Google is signed
      // out. Deleted, not revoked - see the rotation grace window above.
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, existing.id));
      return linked;
    });
  }

  try {
    return await createUserWithDefaults({ email: profile.email, passwordHash: null, googleSub: profile.sub });
  } catch (err) {
    // Two callbacks for the same new account at once (double click): the
    // unique indexes stop the second insert - the first one's user is it.
    if (isUniqueViolation(err)) {
      const user = await findUserForGoogle(profile);
      if (user?.googleSub === profile.sub) return user;
    }
    throw err;
  }
}

export async function validateCredentials(email: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    throw new AuthError('invalid_credentials', 'Wrong email or password');
  }
  // Created through Google, never had a password. Saying so doesn't leak
  // more than /register already does (email_taken).
  if (!user.passwordHash) {
    throw new AuthError('use_google_login', 'This account signs in with Google');
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    throw new AuthError('invalid_credentials', 'Wrong email or password');
  }
  return user;
}

const ROTATION_GRACE_MS = 60_000;

// A demo session lives a day, not JWT_REFRESH_TTL: every anonymous demo
// login adds a refresh-token row to the one shared account.
const DEMO_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

export async function issueTokenPair(user: { id: string; email: string; isDemo?: boolean }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, ...(user.isDemo ? { demo: true } : {}) });
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = user.isDemo ? new Date(Date.now() + DEMO_REFRESH_TTL_MS) : refreshTtlToDate();

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // Rotation keeps the old row (revokedAt) for the grace window below, so
  // without this every refresh would leave a row behind forever. Only rows
  // that could no longer be accepted anyway are dropped.
  await db
    .delete(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, user.id),
        or(
          lt(refreshTokens.expiresAt, new Date()),
          lt(refreshTokens.revokedAt, new Date(Date.now() - ROTATION_GRACE_MS)),
        ),
      ),
    );

  return { accessToken, refreshToken, expiresAt };
}

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
