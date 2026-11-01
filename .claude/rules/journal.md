---
paths:
  - "frontend/src/pages/DashboardPage.tsx"
  - "frontend/src/components/Pagination.tsx"
  - "frontend/src/components/SetsSummary.tsx"
---

# Журнал тренувань (Dashboard, `/`)

Суміжне в інших правилах: лічильник «Спробуй більше» біля кожної вправи (`progressAt`) —
`.claude/rules/progression.md`; календар консистентності над списком —
`.claude/rules/schedule-calendar.md`; бейдж і блок прикладів — `.claude/rules/demo-template.md`;
колір картки за міткою (`utils/labelColor.ts`) — `.claude/rules/programs.md`.

**Пагінація.** Класичні сторінки: `GET /api/workouts?page=&pageSize=` повертає `{ data, total,
page, pageSize, totalPages }` (offset-запит + `count()` в одному запиті), фронтенд —
`useWorkoutsQuery` + `components/Pagination.tsx` (номери сторінок, prev/next). Без неї старі
імпортовані тренування непомітні в UI. Номер сторінки живе в URL (`?page=N` через
`useSearchParams`), не в локальному `useState`, — інакше перехід на сторінку тренування і назад
скидав журнал на першу сторінку (`DashboardPage` розмонтовується при переході на `/workouts/:id`).

**Картка тренування** (мобільна `MobileWorkoutCard` < `sm` з групами за місяцем, десктопна ≥ `sm`) —
`div.card relative`, у `<h3>` — `WorkoutCardLink`: `<Link to=/workouts/:id>`, розтягнутий на всю
картку (`after:absolute after:inset-0`), кільце фокусу — навколо картки. Назва посилання = дата
(+ день тижня на мобайлі) + мітка програми (`sr-only`; видимий бейдж — `aria-hidden`), а не весь
текст картки; Ctrl/середній клік відкриває нову вкладку. Усе інше клікабельне в картці лежить над
посиланням: меню «⋮» — `relative z-10`, відкрите — `z-30` (інакше його Popconfirm «Видалити»
опиняється під «⋮» наступної картки), підказка «Закрито автоматично» (`title`) — `relative z-10`.
Компроміс (рішення користувача): текст картки не виділяється мишею. Десктопна дата в h3 —
`font-sans tracking-normal` (базовий h3 — Bebas); перед десктопним списком — `sr-only` h2
`dashboard.workoutsHeading` (на мобайлі h2 — місяці). Патерн «клікабельна картка» —
`DESIGN_PRINCIPLES.md` §7.

**Рядок вправи** (`components/SetsSummary.tsx`, рішення користувача 2026-10-25, ux-audit 09):
вага один раз (вона одна на всю вправу), далі повторення кожного підходу — «32.5 кг · 12 · 12 · 10»,
тож спад повторень видно; кожне число не розривається, рядок переноситься між підходами. Для
штанги — ще «по 16.25 кг на сторону». Вправа без підходів (напр. скопійована з шаблону) — «—»,
а не гола вага, схожа на виконаний підхід. Числа — через `formatKg` (`CLAUDE.md`, «Локалізація»).
