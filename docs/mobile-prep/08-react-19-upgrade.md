# Завдання 8: Оновити фронтенд до React 19

## Мета
Перевести `frontend/` з React 18.3 на актуальний React 19.x.

## Навіщо
Expo SDK 57 (стартова версія для мобільного застосунку) закріплює React 19.2.
У спільному pnpm-монорепо дві мажорні версії React — джерело runtime-помилок
(дублікати React). Оновити веб заздалегідь простіше, ніж підтримувати спільні пакети
сумісними з 18 і 19 одночасно.

## Що зробити
1. Перевірити сумісність усіх залежностей `frontend/package.json` з React 19
   (react-router-dom 6, @tanstack/react-query 5, recharts 2, react-i18next,
   @lukemorales/query-key-factory, devtools) — список з висновком «ок / потрібне оновлення».
   Оновлювати лише те, що необхідно.
2. Оновити `react`, `react-dom`, `@types/react`, `@types/react-dom` до 19.x (версію
   узгодити з тим, що пінить Expo SDK 57 — 19.2, якщо доступна).
3. Виправити breaking changes React 19 / нових типів: `ref` як prop, `useRef` з
   обов'язковим аргументом, глобальний `JSX` namespace → `React.JSX`, прибрані API
   (`propTypes`, `defaultProps` у функціях, string refs) — що з цього реально є в коді.
4. Recharts на React 19: перевірити графіки на `/progress` (чи не повернувся баг
   з невидимою лінією — див. gotcha про `isAnimationActive={false}` у CLAUDE.md).
5. Нагадування (CLAUDE.md, Windows): `npm install` виконати і в контейнері, і **на хості**
   в `frontend/`, інакше редактор показуватиме хибні помилки типів.

## Обмеження
- Не мігрувати на React Router 7 / інші мажорні оновлення без потреби — окреме рішення.
- Без нових фіч React 19 (actions, `use`) у цьому завданні — лише оновлення.

## Перевірка
- `npm run build` і `tsc --noEmit` без помилок; dev-сервер стартує без попереджень у консолі.
- Ручний прогін усіх сторінок з `frontend/src/pages/` (зараз 11, включно з
  `/integrations`, `/oauth/consent`, `/privacy`) — дай чек-лист.
- CLAUDE.md: версія React у розділі «Стек».
