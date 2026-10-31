---
description: Наздогнати документацію MyGym після змін поза `/feature` (з чату claude.ai, руками, хотфікс) — запускає субагента docs-keeper від `docs/.docs-synced` до HEAD і комітить `docs:`. Використовуй, коли користувач просить оновити/синхронізувати документацію або каже, що щось змінили не через оркестратор.
argument-hint: (без аргументів)
allowed-tools: Bash(git status*), Bash(git diff*), Bash(git log*), Bash(git branch*), Bash(git switch*), Bash(git add*), Bash(git commit*), Bash(git rev-parse*), Bash(git merge-base*), Read, Task
---

Документація (`CLAUDE.md`, `.claude/rules/`, `docs/db/`) описує поточний стан коду. `/feature` оновлює її
сам (крок 5); ця команда — для змін, що пройшли повз нього.

## 1. Перевір стан

1. `git branch --show-current` і `git status --porcelain`.
2. **Незакомічені зміни коду** (не `CLAUDE.md` / `.claude/rules/` / `docs/`) → зупинись: документувати можна
   лише закомічене (`docs/.docs-synced` фіксує SHA коміту). Скажи користувачу закомітити
   їх (або оформити через `/feature`) і вийди.
3. **На `main`** → у `main` комітити не можна: `git switch -c docs/sync-<YYYY-MM-DD>`.
   На будь-якій іншій гілці — лишайся в ній.
4. Покажи, що синхронізуватимеш: `git log --oneline $(cat docs/.docs-synced)..HEAD`
   (файла нема — `git merge-base main HEAD`). Порожньо → «документація актуальна», вийди.

## 2. docs-keeper

`Task(subagent_type=docs-keeper)` з брифом: "окремої задачі нема — наздожени
документацію під усе, що змінилось від `docs/.docs-synced`; це зміни поза `/feature`,
перелічи їх у звіті".

## 3. Перевір і закоміть

- `git diff -- CLAUDE.md .claude/rules/ docs/` — вигадане чи зайве прибери (docs-keeper пише лише
  підтверджене кодом, але перевір).
- Коміт лише документів і `docs/.docs-synced`:
  - були зміни → `docs: sync docs with <що саме, коротко>` (або `docs(db): …`, якщо лише схема);
  - `NO_DOC_CHANGES` → `docs: mark docs synced`.
- «Схему не перезнято» → скажи застосувати міграції в dev-стеку (`npm run db:migrate`) і
  запустити `/sync-docs` ще раз; `docs/.docs-synced` у такому разі не комітити.

## 4. Звіт

Звіт docs-keeper як є + гілка й коміт. Якщо створив гілку `docs/sync-…` — нагадай:
`git push -u origin <гілка>` → PR у `main`. **Не пуш і не мерж сам.**
