# Domain module — workout trackers and fitness logging apps

Apply when the product logs training: workout trackers, gym logs, programme
builders, coaching apps. The general passes judge craft; this module judges
whether the product works **in the gym**, which no generic review sees.

## The context of use (set this before judging anything)

Between sets the user holds the phone in one hand, often sweaty or chalky,
breathing hard, 60–180 seconds of rest, gym lighting that is either dim or
glaring, phone on a bench or the floor 50–80cm away. Attention is on the
body, not the screen. "Design for the gym, not the couch."

On desktop the same user is calm: planning a programme, reviewing progress,
editing history. Judge desktop by planning and analysis quality, not logging
speed.

## The core loop: log a set

Count taps for each of these, on mobile, and put the counts in the report:

| Action | Good | Acceptable | Problem |
|---|---|---|---|
| Log a set identical to last time | 1 tap (a check) | 2 | ≥ 3 |
| Change weight by one step (±2.5 kg / ±5 lb) | 1 tap (stepper/chip) | 2 | keyboard required |
| Change reps by 1 | 1 tap | 2 | keyboard required |
| Start rest timer after a set | 0 (automatic) | 1 | navigate to another screen |
| Move to next exercise | 1 | 2 | ≥ 3 or scroll hunt |
| Resume an interrupted workout | 1 (banner/card) | 2 | progress lost |

Reference patterns from the category leaders:
- **Previous values in every set row** (Hevy's "PREVIOUS" column; tappable to
  copy into the current set). Without it, users must remember or scroll
  history.
- **Prefilled weights from last session**, automatic rest timer that starts
  when a set is checked (Strong).
- **Rest adjustments of ±15s** and skip, without leaving the screen.
- Native apps add lock-screen widgets / Live Activities; a web app cannot.
  Look for the web substitutes instead: Screen Wake Lock during an active
  workout, a vibration or notification at the end of rest, a timer that
  survives navigation between screens and tab switches.

## Glanceability at arm's length

From 50–80cm, these must be readable in the active-workout screen without
picking up the phone: exercise name, set N of M, target (weight × reps),
rest countdown. Rough sizes: countdown ≥ 32px, current set values ≥ 20px,
tabular figures. Strong contrast; one accent for "current/next".

## Input ergonomics

From probe-craft `inputErgonomics`:
- Weight fields accept decimals: `inputmode="decimal"` (or `type=number`
  with `step="any"`). Comma-decimal locales (uk, de, pl…) type `,` — verify
  that "62,5" is accepted and stored as 62.5, not rejected or truncated.
- Reps: `inputmode="numeric"`.
- Inputs ≥ 16px font (iOS zoom), ≥ 44–48px tall, generous gaps — a mis-tap
  on the wrong set row is the commonest gym error.
- The focused field is not hidden by the keyboard; "Next" moves weight →
  reps → next set.
- Steppers or chips (±1, ±2.5, ±5) beat the keyboard for small changes.

## States specific to training

- **First workout ever**: the "previous" column should say "no history yet",
  not be blank or show 0.
- **Offline**: gyms have poor signal. Logging must work offline and sync
  later; at minimum it must never lose a logged set. Test with offline
  emulation mid-workout.
- **Interrupted**: reload mid-workout → state intact, timer recalculated.
- **Long workouts**: 8+ exercises × 5 sets — does the screen stay navigable?
  Is there an overview/jump list?
- **Units**: kg/lb consistent everywhere, including history and charts.

## Emotional peaks (Peak-End rule)

- **Personal record** at the moment it happens — a clear, celebratory but
  short moment (Strong does a brief PR animation). Missing PR feedback is a
  missed peak, not just a missing feature.
- **End of workout**: a summary with meaning — duration, volume, sets, PRs,
  comparison to last time — instead of "Saved". This is the screen that
  decides whether the session "felt good".
- **Progress views**: per-exercise history and charts that answer "am I
  getting stronger?" at a glance. Charts need units, readable axes, and the
  right default range.

## Visual tone for the domain

- Dark theme by default or following the system, on dark grey (not #000).
- One energetic accent used for action and progress, not sprinkled.
- Domain specificity: the product should feel like training — data,
  progression, effort — not like a generic to-do list with a dumbbell emoji.

## Desktop for a training app

- Programme builder: drag/reorder, bulk edit sets, copy weeks.
- Analysis: wide charts, tables of history, comparisons across exercises.
- A phone-width column centred on a 1440px screen wastes the one context
  where the user has time and space.

## Adding other domain modules

This file is the template. For another domain, write
`references/domain-<name>.md` with the same sections: context of use, the
core loop with tap budgets, glanceability, input ergonomics, domain states,
emotional peaks, desktop role. Mention it in SKILL.md's domain step.
