# 01 · Доступність: швидкі виправлення

Гілка: `fix/a11y-quick-wins`. Знахідки аудиту 10, 11, 12, 14, 15
(`docs/ux-audit/AUDIT-2026-10-25.md`). Лише фронтенд, без змін API.

## 1. `<html lang>` не змінюється при перемиканні мови (знахідка 12, WCAG 3.1.1)

**Що зараз.** `frontend/index.html` має статичний `<html lang="uk">`. При англійській
локалі скрінрідер читає англійський інтерфейс українським голосом.

**Що зробити.** У `frontend/src/i18n/index.ts` після ініціалізації:
`document.documentElement.lang = i18n.language` і
`i18n.on('languageChanged', (l) => { document.documentElement.lang = l.split('-')[0]; })`.

## 2. Згорнуте мобільне меню лишається в порядку Tab (знахідка 10, WCAG 2.4.3, 2.4.7)

**Що зараз.** `components/Navbar.tsx`, контейнер мобільного меню (~рядок 120) ховається
через `grid-rows-[0fr] opacity-0`, але лишається в DOM без `inert`. Виміряно: після
«Open menu» Tab 2–10 проходить невидимі Journal, Programs, Progress, Exercises, Import,
Integrations, **Log out**, EN, UA — фокусу на екрані не видно.

**Що зробити.** Проєкт на React 18.3, який ще не знає boolean-атрибута `inert`, тому
`inert={mobileOpen ? undefined : ''}` (TS: `// @ts-expect-error` або розширити
`HTMLAttributes`) і `aria-hidden={!mobileOpen}` на цей контейнер.
Анімацію не чіпати.

## 3. Поля ваги й повторень без доступної назви (знахідка 11, WCAG 4.1.2, 1.3.1)

**Що зараз.** `pages/WorkoutFormPage.tsx`: `<label className="label">` для ваги (~рядок 464)
без `htmlFor`, `<input inputmode="decimal">` без `id`; поля повторень (~рядок 500) мають
поруч лише `<span>1</span>`. На одному тренуванні — 28 полів без назви.

**Що зробити.** Вага: `id={\`weight-${block.key}\`}` + `htmlFor`. Повторення:
`aria-label={t('workout.repsAria', { exercise: name, set: i + 1 })}`, новий ключ в обох
словниках («Присідання, підхід 1, повторення» / «Squat, set 1, reps»).

## 4. Графіки без текстової альтернативи, чипи без стану (знахідка 14, WCAG 1.1.1, 4.1.2)

**Що зараз.** `components/ProgressChart.tsx`, `components/WeeklyCategoryChart.tsx` —
SVG без `role`/`aria-label`. Чипи вправ на `pages/ProgressPage.tsx` — кнопки без `aria-pressed`.

**Що зробити.** Обгортка графіка: `role="img"` + `aria-label` з коротким підсумком
(назва метрики, перше → останнє значення, напр. «Робоча вага: 10 → 20 кг, серпень–жовтень»).
Чипам — `aria-pressed={selected}`.

## 5. Меню «+ New workout» без Escape і ARIA (знахідка 15)

**Що зараз.** `components/NewWorkoutButton.tsx`: кнопка без `aria-expanded`/`aria-haspopup`,
Escape меню не закриває (перевірено). Профільне меню в `Navbar.tsx` (~рядки 168–186) уже це вміє.

**Що зробити.** Скопіювати патерн: `aria-haspopup="menu"`, `aria-expanded={open}`,
`keydown` Escape → `close()` і повернути фокус на кнопку.

## Перевірка

- Мобільна ширина 375: з закритим меню перший Tab після «Open menu» потрапляє на «+ New workout».
- Перемкнути EN/UA — `document.documentElement.lang` змінюється.
- Скрінрідер (або дерево доступності DevTools) на сторінці тренування: кожне поле має назву.
- `npm run build` у `frontend/` без помилок; i18n-скрипт звірки ключів зелений.
