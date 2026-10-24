# Скіли тренера для інших AI

Два тренери, створені в Claude (жовтень 2026):

| Файл | Що це | Потрібно |
|---|---|---|
| `mygym-bodybuilding-coach.md` | Тренер на даних MyGym (+ годинник і ваги через Health Connect, коли з'являться) | Підключений MyGym MCP |
| `bodybuilding-coach.md` | Універсальний тренер: сам питає, звідки брати дані (CSV, Google Таблиця, трекер, без даних) | Нічого |

Обидва файли — звичайний Markdown з інструкціями. Шапку `--- name / description ---`
інші AI просто ігнорують. Обґрунтування правил — `docs/coach-data/RESEARCH.md`
і звіт «Тренування і відновлення для тренера».

Файли довші за ліміт полів інструкцій (~13–16 тис. символів проти 8 000 у
ChatGPT), тому всюди схема однакова: **файл — як знання, коротка інструкція —
в поле інструкцій.**

## Коротка інструкція (вставити в поле інструкцій)

```
Ти — персональний тренер з бодібілдингу. Твої повні правила — у прикріпленому
файлі <назва файлу>.md. Перед кожною відповіддю про тренування, прогрес,
повернення після перерви, готовність, біль чи харчування звіряйся з ним і
дотримуйся його дослівно, зокрема розділу «Межі безпеки». Відповідай
українською, коротко і по ділу: конкретні ваги, підходи, повтори.
```

## ChatGPT

1. **Custom GPT:** Explore GPTs → Create → Configure. Instructions — коротка
   інструкція вище; Knowledge — завантажити `.md`-файл тренера.
   Або **Project:** New project → Project instructions + файл у Files.
2. Для `mygym-bodybuilding-coach` підключити MyGym: Settings → Connectors
   (developer mode) → Create → URL `https://my-gym-com.duckdns.org/mcp` → Sign in.
   OAuth MyGym уже дозволяє `chatgpt.com` (див. CLAUDE.md, «OAuth для MCP-клієнтів»).
   Назви інструментів у ChatGPT ті самі, тож скіл працює без змін.

## Gemini

1. **Gem:** Gems → New Gem → Instructions — коротка інструкція; файл тренера —
   через додавання файлів до Gem.
2. MyGym MCP у звичайному Gemini-застосунку, ймовірно, недоступний — тоді
   користуйся `bodybuilding-coach.md` (з CSV-експортом або без даних).
   Gemini CLI підтримує MCP-сервери (`settings.json` → `mcpServers`).

## Claude Code (локально, поза claude.ai)

Скопіювати як скіл:
```
~/.claude/skills/mygym-bodybuilding-coach/SKILL.md
~/.claude/skills/bodybuilding-coach/SKILL.md
```
(або в `.claude/skills/` репозиторію — тоді скіл бачать лише в цьому проєкті).

## Інші (Cursor, Copilot, локальні моделі)

Будь-яке поле системних правил / «rules» + файл як контекст. Для MCP-клієнтів —
URL `https://my-gym-com.duckdns.org/mcp` і заголовок
`Authorization: Bearer mygym_pat_…` (токен — сторінка «Інтеграції» в MyGym).

## Оновлення

Джерело правди — скіли в Claude. Після змін там оновити файли тут
(попросити Claude: «онови docs/coach-skills зі скілів») і перезавантажити їх
у GPT / Gem.
