# States and motion — the moments a static screenshot hides

A screenshot captures one state. Most of the product is in the others. A
senior review provokes each state on purpose instead of describing the happy
path only.

## How to provoke each state

| State | How to see it |
|---|---|
| **First run / empty** | A fresh or test account; or a list filtered to nothing; or a new entity with no history. |
| **Loading** | Network throttling (DevTools MCP `Slow 3G`), or a hard reload while watching; capture mid-load. |
| **Error** | Network `Offline` and repeat an action; submit an invalid form; open a non-existent route (`/does-not-exist`, `/workout/999999`). |
| **Partial / long content** | The longest real names, numbers with many digits, a list with 50+ items, a user with years of history. Look for truncation and wrapping. |
| **Success / completion** | Finish the core task; what happens at the end? |
| **Interrupted** | Start the core task, reload or navigate away, come back. Is progress kept? |
| **Destructive** | Delete something (on test data only, and only with the user's go-ahead). Confirm or undo? |
| **Offline (if relevant)** | Offline emulation during the core task. |

Stay read-only on real data. Destructive and write actions only on a test
account, and only after the user agreed to them in chat.

## What good looks like

- **Empty states** explain what will appear here, why it is empty, and offer
  the one action that fills it. A blank panel or a lone "No data" is a dead
  end — and it is usually the first screen a new user sees.
- **Loading** uses skeletons shaped like the content, appears only after
  ~300ms (no flash for fast loads), and never shifts the layout when content
  arrives. Doherty threshold: respond within ~400ms or show progress.
- **Errors** say what happened in human words, what the user can do, and keep
  their input. Inline field errors beside the field, not only a toast.
- **Success** confirms the result with specificity ("Workout saved · 14 sets ·
  6,240 kg") rather than a generic toast. The end of a core task is a peak
  moment (Peak-End rule) — design it.
- **Interrupted** tasks resume: a banner or card "Continue workout" with the
  state intact.
- **Undo** beats confirmation dialogs for frequent, reversible actions.

## Motion

- Purpose first: motion should explain a change (where did this come from,
  where did it go), confirm an action, or celebrate. Decorative motion on
  every element is noise.
- Durations: 100–150ms for feedback (press), 150–250ms for small transitions,
  250–400ms for larger layout changes. Ease-out entering, ease-in leaving.
- Respect `prefers-reduced-motion` (probe-craft `platform.motion`).
- Celebrations (a PR, a streak, finishing) can be bolder and longer — they
  are the peak — but must not block the next action.
- No motion that delays a repeated task (an animation on every set logged
  quickly becomes friction).
