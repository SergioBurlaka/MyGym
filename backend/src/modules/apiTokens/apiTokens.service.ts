import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { apiTokens, users } from '../../db/schema.js';
import { generatePersonalAccessToken, hashRefreshToken } from '../../utils/tokens.js';

// Plenty for "Claude Code on the laptop, Claude Desktop, a spare", and a
// ceiling for a script that creates tokens in a loop.
export const MAX_ACTIVE_TOKENS = 20;

// lastUsedAt only needs minute precision; without this every MCP tool call
// would also be a write.
const LAST_USED_RESOLUTION_MS = 60_000;

export class ApiTokenError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// Never selects tokenHash: the list is metadata only.
export async function listApiTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
}

// Returns the raw token - the only time it exists outside the client.
export async function createApiToken(userId: string, name: string) {
  return db.transaction(async (tx) => {
    // Locks the user's row so parallel creates count one after another -
    // otherwise N simultaneous requests would all see "19" and pass the cap.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');

    const [{ active }] = await tx
      .select({ active: count() })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
    if (active >= MAX_ACTIVE_TOKENS) {
      throw new ApiTokenError('too_many_tokens', `At most ${MAX_ACTIVE_TOKENS} active tokens`);
    }

    const token = generatePersonalAccessToken();
    const [row] = await tx
      .insert(apiTokens)
      .values({ userId, name, tokenHash: hashRefreshToken(token) })
      .returning({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt });
    return { ...row, token };
  });
}

// Soft revoke: the row stays (who had which token, when it was last used),
// the hash simply stops matching in findUserByApiToken.
export async function revokeApiToken(userId: string, id: string) {
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return row ?? null;
}

export async function findUserByApiToken(rawToken: string) {
  const [row] = await db
    .select({ tokenId: apiTokens.id, userId: users.id, email: users.email, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, hashRefreshToken(rawToken)), isNull(apiTokens.revokedAt)));
  if (!row) return null;

  const now = new Date();
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS) {
    // Conditional, so parallel requests don't all write.
    await db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiTokens.id, row.tokenId),
          or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, new Date(now.getTime() - LAST_USED_RESOLUTION_MS))),
        ),
      );
  }
  return { userId: row.userId, email: row.email };
}
