# <Product> — design principles

This file is the standard the product's UI is reviewed and changed against. The
`senior-design-review` skill reads it and ranks its rules **above** its own
defaults. Change a rule here, not inside a task.

Markers: **[decision]** — already true in the code or explicitly agreed;
**[target]** — where we are heading; violations still exist (link the finding or task).

Delete what does not apply. Keep each rule short and checkable.

## 1. Context of use

- Primary device and situation: <e.g. phone, one-handed, in a hurry / desktop, focused work>.
- What desktop is for: <e.g. planning and analysis>. What mobile is for: <e.g. the core loop>.
- Reference viewports for reviews: mobile <390×844>, desktop <1440×900>. Themes: <light / dark / both>.

## 2. Identity

- **[decision]** Display font: <…>. Text font: <…>. No third family.
- **[decision]** Brand colour: <hex> (logo). Not to be changed.
- Where the source of truth for design lives: <Figma / design canvas / Storybook URL>.
- Things we do not do: <e.g. gradients as decoration, emoji as icons, cards inside cards>.

## 3. Tokens

| Token | Value | Used for |
| :-- | :-- | :-- |
| `surface` | <hex> | page background |
| `surface-raised` | <hex> | cards |
| `border` | <hex> | dividers, borders |
| `accent` | <hex> | primary action, selected state |
| `success` | <hex> | progress, done |
| `warning` | <hex> | attention |
| `danger` | <hex> | errors, destructive actions |

Text: primary <token>, secondary <token>, tertiary <token>. New colours become a token
here and in the config first; no raw hex in components.

## 4. Colour semantics

- **[decision]** `accent` means "act here" or "selected" — nothing else.
- Progress and success are never drawn in the danger colour.
- Colour is never the only signal: state also has an icon or a word.
- Tracks, outlines and dividers are visible on their own background (≥ 1.5:1).

## 5. Typography

- Scale (px): <12 · 14 · 16 · 18 · 20 · 24 · 30>. No sizes outside it.
- Minimum 12 px for any meaningful text, including chart axes.
- Mobile inputs 16 px (iOS zooms below that).
- Changing numbers (timers, prices, measurements) use `tabular-nums`.
- Weights: <400 · 600 · 700>. Values weigh more than their labels.

## 6. Spacing and shape

- 4 px base, 8 px rhythm; only the spacing scale <…>. No arbitrary values.
- Space inside a group is smaller than between groups (at least 1:2).
- Radii: <8> controls, <12> cards, full for pills.

## 7. Action hierarchy

- **[decision]** One primary button per screen or dialog.
- A disabled primary looks neutral, not like a faded accent.
- Destructive actions never sit next to the primary action at equal weight; prefer an
  overflow menu or undo.
- Undo beats a confirmation dialog for frequent, reversible actions.

## 8. Mobile

- Touch targets ≥ 44×44 px with ≥ 8 px between them.
- The main repeated action lives in the thumb zone (sticky bottom bar or FAB).
- Navigation: <bottom tab bar with N items / other — decision and reason>.
- No horizontal page scroll. Bottom bars respect `env(safe-area-inset-bottom)`.
- Recompose, don't shrink: tables → cards, modals → bottom sheets.

## 9. Core loop

- The one task users repeat most: <…>. Tap budget: <…>.
- What must be readable at a glance: <…>.
- Peak and end moments that deserve design: <e.g. success, record, summary>.

## 10. Data and charts

- Axes carry units; tick labels are never clipped; large numbers abbreviated (12k).
- One date format everywhere, via `Intl.DateTimeFormat`.

## 11. States

- Empty states explain and offer the one action that fills them.
- Loading uses skeletons shaped like the content; no layout shift.
- Errors say what happened and what to do, and keep the user's input.
- Every control has hover, pressed and `:focus-visible` states; motion respects
  `prefers-reduced-motion`.

## 12. Language and copy

- Locales: <…>. Every new string in all of them.
- One name per concept: <glossary of the terms that tend to drift>.
- Sentence case for UI labels.
