---
paths:
  - "backend/src/modules/progression/**"
  - "backend/test/progression.test.ts"
  - "frontend/src/pages/ProgressPage.tsx"
  - "frontend/src/components/ProgressChart.tsx"
  - "frontend/src/components/ChartSkeleton.tsx"
  - "frontend/src/components/WeeklyCategoryChart.tsx"
  - "frontend/src/utils/weeklyVolume*.ts"
  - "frontend/src/shared/api/progression/**"
---

# Аналітика: історія вправи, сторінка «Прогрес», графіки

Лічильник «Спробуй більше», правила прогресу й модель навантаження (вага в повторенні,
обсяг) — `.claude/rules/progression.md`.

**Розширена аналітика (`HistoryPoint`, `GET /api/progression/:exerciseId/history`):**
крім `totalWeightKg`/`maxReps`/`avgReps`/`setsCount` рахує (в `buildHistory`):
- `estimatedOneRepMaxKg` — 1ПМ за формулою Epley (`вага в повторенні × (1 + повт/30)`, округлено до 0.1),
  `null` якщо вправа без ваги. Ненадійна на 15+ повтореннях — свідомо не приховується,
  графік просто показує тренд.
- `volumeKg` (`вага в повторенні × сума повторень × сторони`) + `totalReps` (теж × сторони) — для безвагових
  вправ `volumeKg = null`, фронтенд перемикається на `totalReps` як "обсяг".
- `isWeightPR` / `isRepsPR` — true, коли значення точки строго більше за всі
  попередні хронологічно (running max, рахується в тому ж проході `buildHistory`).
  Рендериться на графіку як більша точка + рядок "🏆 Особистий рекорд" у тултипі
  (`components/ProgressChart.tsx`, кастомний `dot`-рендерер і `content` для Tooltip).
- **Картка вправи на «Прогресі»** (`ProgressPage.tsx`): при `suggestion = 'ok'` — той самий
  лічильник, що й плитка (`tryMoreStatus(selected)` → `TryMoreStatusBadge`), і текст
  `progression.message.okCountdown` (плюральний, `count` = скільки лишилось); дії
  (`increase_weight`/`start_adding_weight`/`try_more`/`no_data`) — `ProgressionBadge` +
  `progressionMessage`. «Востаннє» — `formatDate` (день + місяць словом; рік — лише не
  поточного року), «Тренувань без прогресу» — «N з M тренувань» (`progressStatus.ofWorkouts`).
  Вправа, у якої в жодній сесії нема ваги (`hasWeight`), не показує графіків робочої ваги й 1ПМ;
  без історії — видно всі чотири, кожен зі своїм порожнім підписом.
- **Завантаження графіків на «Прогресі»:** історія йде через `useDeferredValue` пари
  `{id, data}` — плитка підсвічується одразу, графіки перемальовуються у фоні. `chartsLoading`
  (запит pending, відкладене значення — іншої вправи, або ще порожнє) → справжні картки
  (заголовок + опис), а замість кожного графіка `ChartSkeleton` — без зсуву макета й без старих
  ліній під новою назвою; скільки карток (2 чи 4) — вгадує з огляду (`lastWorkoutDate`/
  `lastTotalWeightKg`). Рефетч тієї ж вправи — графіки `opacity-50`. Тижневий графік pending →
  `WeeklyChartSkeleton` (421 px телефон / 342 px від `sm`, як справжній). Під час завантаження —
  sr-only `role="status"` (`common.loadingChart` / `common.loading`). Сітки графіків —
  `grid-cols-1`: неявна колонка не стискається нижче піксельної ширини графіка.
- `GET /api/progression/volume-by-category?weeks=all|N` — сума обсягу по (ISO-тиждень, категорія)
  лише за тижні з підходами; `all` — уся історія (так кличе «Прогрес»), число — вікно 1–52, default 12,
  назад від `getUserToday`.
  `large`/`small` — кг, `bodyweight` — повторення. `WeeklyCategoryChart.tsx` малює div-стовпці, не
  Recharts (смуга ширша за картку й скролиться, кожен тиждень — кнопка): уся історія —
  `utils/weeklyVolume.ts::fillWeeks` заповнює пропущені тижні нулями від першого до поточного
  (не більше `MAX_WEEKS` календаря). Колонка тижня 39 px, три стовпці: `large` (#3b82f6) і
  `small` (#d0609b) на шкалі кг (`niceMax` — одна кругла шкала на всю історію, 3 кроки),
  `bodyweight` (#c98500) — на власній шкалі повторень (`repsMax`: максимум історії, округлений
  угору до 50) — подвійна шкала за рішенням користувача. Окремої колонки осі Y нема: верх шкал —
  підписи в кутах (кг ліворуч, повторення праворуч), сітка — верх і половина шкали. Дата —
  під кожним 4-м тижнем, відлік від поточного (він завжди підписаний).
- **Плитки тижня** над графіком: заголовок «тиждень з–по» і три плитки (значення категорії +
  «↑/↓ N% від середнього»). Середнє — `weekAverage`: за `AVERAGE_WEEKS` (12) тижнів **до
  вибраного включно**, тижні без тренувань — нулі; коротша історія — за наявні. Середнє 0 —
  без відсотка. Відкривається на поточному тижні; тиждень вибирають тап / наведення мишею /
  стрілки (один Tab-стоп на смугу); sr-only `aria-live` оголошує тиждень (плитки текстом) лише на
  тап чи стрілку, не на наведення. Смуга прокрутки — 6 px, як у календарі (gotcha Chromium —
  `schedule-calendar.md`).
- **Gotcha:** Recharts `<Line>` за замовчуванням анімує "малювання" лінії через
  `strokeDasharray`, і в цьому проєкті анімація стабільно застрягає на першому
  кадрі (лінія невидима, хоч шлях у SVG правильний) — тому `isAnimationActive={false}`
  на `<Line>` в `ProgressChart.tsx`.
- **Gotcha:** у `ProgressChart.tsx` **без `ResponsiveContainer`** — він міряє себе й робить
  setState поза transition, і весь графік рендериться одним блокуючим проходом (заморожував
  «Прогрес»). Ширину міряє власний `ResizeObserver` і ставить у `startTransition`, `LineChart`
  отримує явні `width` і `height` 220; поки ширина 0 — `ChartSkeleton`.
