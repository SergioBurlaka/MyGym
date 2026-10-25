# Report template

Write the report in the user's language (the language they wrote to you in),
unless they asked for another. Keep design terms in English where that is how
the user's team talks (e.g. "empty state", "tap target").

Use this structure. Screenshots: reference them by cell name
(`workout · mobile-390 · dark`) and embed or attach them where the output
format allows.

```
# <Product> — Design review

Scope: screens covered · viewports and themes · browser tier (A = true
emulation / C = narrow-window approximation) · account used · date ·
standards applied (house design system / brief, else this skill's defaults)

## Verdict
3–5 sentences, written like a senior designer talking to the team: what the
product gets right, the one or two things that most hold it back, and how far
it is from feeling crafted. No hedging, no checklist voice.

## Scorecard
Per axis, one line each, 1–5 with a short reason. Never a single total.
- Hierarchy & clarity
- Typography
- Spacing & rhythm
- Colour & theme
- Consistency / system
- States & feedback
- Mobile composition
- Desktop composition
- Identity / specificity
- Domain fit (if a domain module was applied)

## Top priorities
The 3–5 changes with the highest impact ÷ effort, each with finding IDs.

## Findings
Grouped by screen, ordered by severity.

### F07 · Active workout · mobile-390 · dark — Severity 3 · Effort S · measured
**Claim.** Logging a set the same as last time takes 4 taps.
**Why it matters here.** Between sets, one-handed and out of breath, each
extra tap is friction repeated 20–30 times a workout; category leaders do it
in one.
**Evidence.** Tap path: open set → focus weight → type → check (4). No
previous-values column (screenshot `workout · mobile-390 · dark`).
**Principle.** Fitts / efficiency of use (Nielsen #7); domain tap budget.
**Recommendation.** Before: empty set rows. After: a "Previous 80×8" column
per row; tapping it copies values; a check button logs the set and starts
rest automatically.

## What works
Specific and, where possible, measured. This tells the team what not to
touch.

## Verify on a real device
Things emulation cannot show (see responsive.md §8).

## Method
Browser tier, probes run, passes done, who/what judged. One line noting that
severity from a single reviewer is an estimate.
```

## Field rules

- **Severity 0–4** (Nielsen): 0 not a problem · 1 cosmetic · 2 minor ·
  3 major, fix soon · 4 blocks the task or badly damages trust. Weigh
  frequency × impact × persistence. Repeated-every-session friction in the
  core loop is at least 3.
- **Effort S/M/L**: S = CSS/tokens or copy, under a day · M = component
  change · L = flow or information-architecture change.
- **Basis**, exactly one per finding:
  - `measured` — a probe number or a counted tap path;
  - `observed` — visible in a named screenshot, reproducible by anyone;
  - `judged` — the reviewer's design opinion, argued with a principle.
  Never dress a judgment as a measurement.
- **Claim** is a statement, not a question. "The primary button is a ghost
  button" — not "have you considered…".
- **Recommendation** is concrete enough to implement: values, tokens,
  component, layout. Prefer the smallest change that fixes the problem.
- One finding per problem. If the same issue appears on five screens, one
  finding listing the screens.
- Don't pad. Ten sharp findings beat forty shallow ones. Cosmetic items can
  be batched in one "polish list" finding.
