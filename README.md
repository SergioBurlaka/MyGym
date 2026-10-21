# MyGym

**English** · [Українська](README.uk.md)

A full-stack workout journal for free-weight training. Log your sets, see a
progress chart for every exercise, and get a nudge when it's time to add
weight or reps. Built and used daily by me for my own training, multi-user
from day one.

**Live:** http://91.232.30.91

## Features

- **Workout logging** with any number of sets per exercise, autosave on
  blur/structural change (strictly sequential saves, so no duplicated sets on
  a flaky gym connection).
- **Progression engine** that suggests *increase weight*, *start adding
  weight* or *try more* based on your history (rules below).
- **Progress analytics:** per-exercise charts with estimated 1RM (Epley),
  volume, personal-record markers; weekly volume by muscle group; a
  GitHub-style consistency calendar that judges past days against the
  schedule that was active *then*.
- **Programs** (A/B rotation) that pre-fill a workout with the exercises and
  last-used weights.
- **CSV import** from the Google Sheet I used before this app (idempotent).
- **i18n** (English / Ukrainian), installable as a PWA on Android.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, TanStack Query (query-key factory, one hook per operation), Tailwind CSS, Recharts, react-i18next |
| Backend | Node.js, TypeScript, Fastify 5, Zod validation, Drizzle ORM + drizzle-kit migrations |
| Database | PostgreSQL 16 |
| Auth | argon2id password hashing, short-lived JWT access token + rotating refresh token in an httpOnly cookie |
| Infra | Docker Compose (postgres, api, static SPA, nginx reverse proxy), GitHub Actions CI/CD to a VPS |
| Testing | Vitest integration tests against a real PostgreSQL |

## Architecture

```
          ┌──────────────── VPS (docker compose) ─────────────────┐
browser ──┤ nginx ──/api/*──▶ Fastify API ──▶ PostgreSQL           │
          │   └────/*───────▶ nginx (static React build)           │
          └─────────────────────────────────────────────────────────┘
```

Backend modules (`backend/src/modules/<domain>/`) each have
`*.routes.ts` (HTTP + Zod validation) → `*.service.ts` (business logic,
Drizzle queries) → `*.schema.ts`. Every query is scoped by the
authenticated `userId`; integration tests check that one user can't read,
change or delete another user's data.

### Auth design

- Access token: JWT, 15 min, sent as `Authorization: Bearer`.
- Refresh token: 48 random bytes in an httpOnly cookie (path `/api/auth`);
  only its SHA-256 hash is stored, so a DB dump can't be replayed.
- Every refresh **rotates** the token. A just-rotated token is still accepted
  for 60 s: on a bad mobile connection the response carrying the new cookie
  can get lost, and without this grace window the session would die.
  Logout deletes the row, so the grace window can't revive a logged-out session.
- `/login` and `/register` are rate-limited per client IP. Fastify trusts
  exactly one proxy hop, so a client can't dodge the limit by sending a fake
  `X-Forwarded-For`.

## Progression logic

| Category | Examples | Rep range | Weight step |
|---|---|---|---|
| Large muscle group | squat, deadlift, bench press, bent-over row, lunges | 6–15 | +1.25 kg per side |
| Small muscle group | biceps curl, French press, lateral raise, overhead press | 6–20 | +0.5 kg per side |
| Bodyweight | push-ups, leg/torso raises | 6–30 | suggests starting to add weight |

- Top of the rep range reached → **increase weight** (or **start adding
  weight** for a bodyweight exercise done without weight).
- No progress (neither weight nor max reps went up) for 14+ days → a soft
  **try more** reminder. A program can switch this to "N workouts without
  progress" instead of calendar days.
- The rules live in pure functions (`suggestProgression`,
  `buildHistoryPoints`) with unit tests.

## Running locally

```bash
cp .env.example .env        # dev defaults are fine
docker compose -f docker-compose.dev.yml up --build
```

- Frontend (Vite, hot reload): http://localhost:5173
- API: http://localhost:4000
- PostgreSQL: `localhost:${POSTGRES_PORT:-5432}`

The backend container applies pending migrations on start.

## Tests

```bash
# once: a separate test database in the dev postgres container
docker compose -f docker-compose.dev.yml exec postgres createdb -U <POSTGRES_USER> mygym_test

cd backend
TEST_DATABASE_URL=postgres://<user>:<password>@localhost:<POSTGRES_PORT>/mygym_test npm test
```

The suite covers the auth flow (register, login, refresh rotation and grace
window, expiry, logout, rate limiting, transactional sign-up), per-user data
isolation, input validation and the progression rules. It truncates all
tables between tests, so it refuses to run against a database whose name
doesn't contain `test`.

CI (`.github/workflows/deploy.yml`) runs backend typecheck + tests and the
frontend build on every push and pull request; the deploy job runs only for
`main` and only after both are green.

## Production

```bash
cp .env.example .env
openssl rand -base64 48   # -> JWT_ACCESS_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET
# + a strong POSTGRES_PASSWORD, DOMAIN (e.g. a DuckDNS subdomain) and CERTBOT_EMAIL
docker compose build
sh scripts/init-letsencrypt.sh   # first time only: issues the HTTPS certificate
docker compose up -d
```

Needs a domain pointing at the server and ports 80 + 443 open. nginx
redirects HTTP to `https://<DOMAIN>` and proxies `/api/*` to the backend,
`/mcp` to the MCP server and everything else to the static frontend build.
The `certbot` container renews the Let's Encrypt certificate (checks twice a
day), nginx reloads every 6 h to pick it up. The nginx config is a template,
`nginx/templates/default.conf.template`, with `DOMAIN` filled in at start.

Moving an already running HTTP server to HTTPS: a merge to `main` deploys
right away and nginx can't start without a certificate, so first point the
domain at the server, open 80/443 and add `DOMAIN` + `CERTBOT_EMAIL` to the
server's `.env` (without `DOMAIN` compose fails before touching the old
nginx); then merge, and right after the deploy run
`sh scripts/init-letsencrypt.sh` (a `STAGING=1` dry run first is fine - the
next normal run replaces the staging certificate). Everyone has to log in
again, since the origin changes.

## Repository layout

```
backend/    Fastify API, Drizzle schema & migrations, progression logic, CSV import, tests
frontend/   React SPA
nginx/      Reverse-proxy config (HTTPS template)
scripts/    init-letsencrypt.sh - first certificate issue
.github/    CI/CD workflow
```

## AI-assisted development

I build this project with Claude Code. `.claude/` holds a lightweight AI
orchestrator for solo development, and `CLAUDE.md` documents the architecture
decisions and gotchas.

**Usage:** run `claude` from the repo root, then describe the task:

```
/feature add a "notes" field to workouts
```

Claude then runs the full cycle: **branch → plan (waits for approval) →
implementation with Conventional Commits → review by the `reviewer` subagent →
checks by the `tester` subagent** (backend typecheck + Vitest, frontend build,
en/uk i18n key parity), and finishes with a report. Pushing and opening the PR
stay with me.

| Command | Purpose |
| :-- | :-- |
| `/feature <description>` | main entry point for a feature, fix or change |
| `/review-changes [base]` | independent review of the current branch vs `main` |
| `/update-context` | update only the affected sections of `CLAUDE.md` after notable changes |

**Guardrails:** a `PreToolUse` hook (`.claude/hooks/guard.mjs`, Node, so it works
on Windows too) blocks access to `.env*` files, destructive commands
(`rm -rf`, `git reset --hard`, `docker compose down -v`, `DROP`), force-push,
`--no-verify`, and committing or pushing on `main` (a push to `main` deploys to
the VPS). `.claude/settings.json` sets the allow/ask/deny permissions; git rules
live in `.claude/rules/git-workflow.md`. Full guide (in Ukrainian):
[README.uk.md](README.uk.md#робота-з-claude-code-оркестратор).
