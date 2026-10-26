import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { exercises, programs, trainingScheduleHistory, users, workouts } from '../../db/schema.js';
import { isUniqueViolation } from '../../utils/pgErrors.js';
import { copyTemplateData, findTemplateUser } from './template.service.js';

// `.invalid` is a reserved TLD - no real inbox; registerUser refuses it.
export const DEMO_EMAIL = 'demo@mygym.invalid';
// The demo is re-copied from the template once its copy is this old - on
// the next demo login, or by the hourly sweep.
export const DEMO_RESET_AFTER_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

type User = typeof users.$inferSelect;

const isStale = (u: User, now = Date.now()) => !u.demoResetAt || now - u.demoResetAt.getTime() >= DEMO_RESET_AFTER_MS;

// The shared demo account, created on first use and fresh (re-copied if a
// day old). null = no template configured, so no demo.
export async function getDemoUser(): Promise<User | null> {
  if (!(await findTemplateUser())) return null;
  let demo = await db.query.users.findFirst({ where: eq(users.isDemo, true) });
  if (!demo) {
    try {
      [demo] = await db.insert(users).values({ email: DEMO_EMAIL, passwordHash: null, isDemo: true }).returning();
    } catch (err) {
      // Two first demo logins at once: users_demo_idx lets one insert win.
      if (!isUniqueViolation(err)) throw err;
      demo = await db.query.users.findFirst({ where: eq(users.isDemo, true) });
      if (!demo) throw err;
    }
  }
  return isStale(demo) ? resetDemo(demo.id) : demo;
}

// Wipes the demo's data and copies the template again: settings, schedule
// history, exercises, programs, all finished workouts. The user row (and so
// every open demo session) stays. The row lock makes concurrent resets run
// one after another, and the second sees a fresh copy and does nothing.
export async function resetDemo(demoId: string, { force = false } = {}): Promise<User> {
  return db.transaction(async (tx) => {
    const [demo] = await tx.select().from(users).where(eq(users.id, demoId)).for('update');
    if (!force && !isStale(demo)) return demo;
    const template = await findTemplateUser(tx);
    if (!template) return demo;

    // Workouts and programs first - the exercise FKs are checked at commit.
    await tx.delete(workouts).where(eq(workouts.userId, demoId));
    await tx.delete(programs).where(eq(programs.userId, demoId));
    await tx.delete(exercises).where(eq(exercises.userId, demoId));
    await tx.delete(trainingScheduleHistory).where(eq(trainingScheduleHistory.userId, demoId));

    const history = await tx
      .select()
      .from(trainingScheduleHistory)
      .where(eq(trainingScheduleHistory.userId, template.id));
    if (history.length) {
      await tx.insert(trainingScheduleHistory).values(
        history.map((h) => ({ userId: demoId, trainingDays: h.trainingDays, effectiveFrom: h.effectiveFrom })),
      );
    }
    await copyTemplateData(tx, template.id, demoId, { workouts: 'all' });

    const [updated] = await tx
      .update(users)
      .set({
        trainingDays: template.trainingDays,
        trainingTime: template.trainingTime,
        trainingDurationMin: template.trainingDurationMin,
        timezone: template.timezone,
        calendarFeedTokenHash: null,
        calendarFeedCreatedAt: null,
        demoResetAt: new Date(),
      })
      .where(eq(users.id, demoId))
      .returning();
    return updated;
  });
}

// Resets a day-old demo even if nobody logs in, so a visitor who keeps a
// tab open still gets a clean copy back. Errors are logged, never thrown.
export function startDemoResetSweep(app: FastifyInstance) {
  const run = async () => {
    try {
      const demo = await db.query.users.findFirst({ where: eq(users.isDemo, true) });
      if (demo && isStale(demo)) {
        await resetDemo(demo.id);
        app.log.info('demo account reset');
      }
    } catch (err) {
      app.log.error({ err }, 'demo reset failed');
    }
  };
  void run();
  const timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
