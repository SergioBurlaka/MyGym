#!/usr/bin/env node
// PreToolUse-хук MyGym: детермінований захист, якому не треба "довіряти" LLM.
// Блокує (exit 2 + пояснення в stderr, яке бачить Claude):
//   1. будь-який доступ до .env-файлів (крім .env.example) — Read/Edit/Write/Grep/Glob/Bash
//   2. деструктивні команди (rm -rf, git reset --hard, docker compose down -v, DROP ...)
//   3. force-push, --no-verify
//   4. commit / push, коли поточна гілка — main (push у main = деплой на VPS)
// Написано на Node, а не bash — однаково працює на Windows і Linux.
import { execSync } from 'node:child_process';

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const tool = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const block = (why) => {
    process.stderr.write(`[guard] Заблоковано: ${why}\n`);
    process.exit(2);
  };

  // .env, .env.local, .env.production … але НЕ .env.example
  const isEnvPath = (p) => {
    if (!p) return false;
    const name = String(p).replace(/\\/g, '/').split('/').pop();
    return /^\.env(\..+)?$/.test(name) && name !== '.env.example';
  };
  const ENV_IN_CMD = /(?:^|[\s'"\/\\=<>])\.env(?:\.(?!example\b)[\w-]+)?(?![\w.-])/;

  if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    if (isEnvPath(ti.file_path)) block('файли .env під забороною (секрети). Використовуй .env.example.');
  }
  if (['Grep', 'Glob'].includes(tool)) {
    if (isEnvPath(ti.path) || /(^|\/)\.env(?!\.example)/.test(ti.pattern ?? '') && tool === 'Glob') {
      block('пошук по .env під забороною.');
    }
  }

  if (tool !== 'Bash') process.exit(0);
  const cmd = String(ti.command ?? '');

  if (ENV_IN_CMD.test(cmd)) block('команда звертається до .env (секрети). Використовуй .env.example.');

  const rules = [
    [/\brm\s+-[a-zA-Z]*(rf|fr)[a-zA-Z]*\b/, 'rm -rf'],
    [/\bgit\s+reset\s+--hard\b/, 'git reset --hard (втрата незакомічених змін)'],
    [/\bgit\s+clean\s+-[a-zA-Z]*f/, 'git clean -f'],
    [/\bgit\s+push\b[^|;&]*(\s--force\b|\s-f\b|--force-with-lease)/, 'force-push'],
    [/--no-verify\b/, '--no-verify (обхід перевірок)'],
    [/\bdocker[\s-]+compose\b[^|;&]*\bdown\b[^|;&]*(\s-v\b|--volumes)/, 'docker compose down -v (знищить volume з базою)'],
    [/\bdocker\s+volume\s+(rm|prune)\b/, 'видалення docker volume'],
    [/\b(drop\s+(table|database|schema)|truncate\s+table)\b/i, 'DROP/TRUNCATE в shell'],
  ];
  for (const [re, why] of rules) if (re.test(cmd)) block(`${why}. Якщо це справді потрібно — попроси користувача виконати вручну.`);

  if (/\bgit\s+(commit|push)\b/.test(cmd)) {
    if (/\bgit\s+push\b[^|;&]*\s(origin\s+)?main\b/.test(cmd)) {
      block('push у main запускає деплой на VPS. Пуш тільки feature-гілки, merge — через PR.');
    }
    let branch = '';
    try { branch = execSync('git branch --show-current', { cwd, encoding: 'utf8' }).trim(); } catch {}
    if (branch === 'main') {
      block('ти на гілці main. Спершу створи feature-гілку: git switch -c feat/<назва> (див. .claude/rules/git-workflow.md).');
    }
  }
  process.exit(0);
});
