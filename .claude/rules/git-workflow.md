# Git-процес MyGym

## Гілки

- **Одна фіча — одна гілка.** Ніколи не комітити напряму в `main`
  (хук `guard.mjs` це блокує).
- Назва: `<тип>/<коротко-kebab-case>` від свіжого `main`:
  `feat/workout-notes`, `fix/refresh-token-race`, `chore/update-deps`, `docs/db-architecture`.
- Push у `main` = автодеплой на VPS (`.github/workflows/deploy.yml`). Тому в `main`
  потрапляє лише через PR після зелених CI-джоб (`backend-test`, `frontend-build`).

## Коміти — Conventional Commits

Формат: `<тип>(<scope>)?: <що зроблено>` — англійською, наказовий спосіб, без крапки.

| Тип | Коли |
| :-- | :-- |
| `feat` | нова поведінка для користувача |
| `fix` | виправлення бага |
| `chore` | залежності, конфіг, інфраструктура, тулінг — без зміни поведінки |
| `refactor` | зміна структури без зміни поведінки |
| `test` | лише тести |
| `docs` | лише документація (`CLAUDE.md`, `docs/`) |

Scope — шар або модуль: `backend`, `frontend`, `db`, `auth`, `programs`, `progression`, `i18n`.
Приклад: `feat(programs): add rest timer between sets`.

- **Кілька комітів на фічу**, кожен — завершений логічний крок, що компілюється
  (наприклад: `feat(db): ...` → `feat(backend): ...` → `feat(frontend): ...` → `test(backend): ...`).
- Виправлення після рев'ю — окремим `fix:`-комітом, не amend уже показаного.
- Міграції Drizzle — в тому ж коміті, що й зміна `schema.ts`.

## Чого не робити без явного дозволу користувача

`git push --force`, `git reset --hard`, `git rebase` опублікованих гілок,
merge у `main`, видалення гілок, `--no-verify`.
