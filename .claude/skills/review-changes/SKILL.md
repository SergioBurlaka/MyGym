---
description: Незалежне рев'ю поточної гілки MyGym відносно main через субагента reviewer. Використовуй, коли користувач просить переглянути зміни, перевірити гілку перед PR або другу думку щодо диффу.
argument-hint: "[base-ref]  (за замовчуванням main)"
allowed-tools: Bash(git status*), Bash(git diff*), Bash(git log*), Bash(git branch*), Task
---

База: `${ARGUMENTS:-main}`.

1. `git branch --show-current`, `git log --oneline <base>..HEAD`, `git diff --stat <base>...HEAD`.
   Дифф порожній → скажи це й вийди.
2. `Task(subagent_type=reviewer)` з брифом: назва гілки, список комітів, "переглянь
   `git diff <base>...HEAD`, читай змінені файли повністю, перевір інваріанти з CLAUDE.md".
3. Поверни вердикт і знахідки рев'юера як є (без переказу своїми словами).
   Сам нічого не виправляй — спитай, чи виправляти BLOCKER/MAJOR.
