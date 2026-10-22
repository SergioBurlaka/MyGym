import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { generateCalendarFeedToken, hashRefreshToken } from '../../utils/tokens.js';
import { getScheduleHistory } from '../settings/settings.service.js';
import { buildCalendarFeed, type FeedLang } from './calendar.ics.js';

function feedUrls(token: string, lang: FeedLang) {
  const feedUrl = `${env.PUBLIC_URL}/api/calendar/feed/${token}.ics?lang=${lang}`;
  const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');
  return {
    feedUrl,
    webcalUrl,
    googleUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`,
  };
}

// Creates the feed token, or replaces it: the old URL stops working at once.
// The raw token is returned only here - the database keeps its hash.
export async function createCalendarFeedToken(userId: string, lang: FeedLang) {
  const token = generateCalendarFeedToken();
  const createdAt = new Date();
  await db
    .update(users)
    .set({ calendarFeedTokenHash: hashRefreshToken(token), calendarFeedCreatedAt: createdAt })
    .where(eq(users.id, userId));
  return { ...feedUrls(token, lang), createdAt };
}

export async function deleteCalendarFeedToken(userId: string) {
  await db
    .update(users)
    .set({ calendarFeedTokenHash: null, calendarFeedCreatedAt: null })
    .where(eq(users.id, userId));
}

// null = unknown or disconnected token.
export async function renderCalendarFeed(token: string, lang: FeedLang): Promise<string | null> {
  const [user] = await db
    .select({
      id: users.id,
      trainingTime: users.trainingTime,
      trainingDurationMin: users.trainingDurationMin,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.calendarFeedTokenHash, hashRefreshToken(token)));
  if (!user) return null;

  const history = await getScheduleHistory(user.id);
  return buildCalendarFeed({
    userId: user.id,
    history,
    trainingTime: user.trainingTime,
    trainingDurationMin: user.trainingDurationMin,
    timezone: user.timezone,
    lang,
    appUrl: env.PUBLIC_URL,
  });
}
