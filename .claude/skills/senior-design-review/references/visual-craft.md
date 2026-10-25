# Visual craft — what a senior designer looks at, and the numbers behind it

Read this before the visual pass. Each section gives the question to ask, the
signals that answer it (probe field or screenshot), and what "good" looks like.
Numbers are working defaults from Refactoring UI, Apple HIG, Material 3 and
common design-system practice — not laws. If the product has its own design
system or brief, it wins; say which standard each finding was judged against.

## Contents
1. First impression (5-second test, squint test, specificity test)
2. Hierarchy
3. Typography
4. Spacing and rhythm
5. Colour
6. Depth, shape, borders
7. Iconography and imagery
8. Alignment and composition
9. Genericness — does it look like *this* product?
10. Polish signals (the details that separate "works" from "crafted")

---

## 1. First impression

Do this before reading any probe output, so the numbers do not anchor you.

- **5-second test.** Look at the first-viewport screenshot for five seconds,
  look away, write down: what is this screen for, what is the one thing I am
  supposed to do, what did my eye hit first. If the answers are fuzzy or the
  first fixation is decoration (logo, illustration, gradient banner), that is
  the headline finding of the screen.
- **Squint test.** Blur the screenshot mentally (or literally, if you can
  process the image). What survives the blur is the real hierarchy. Two or
  three masses should remain, ordered by importance. A uniform grey texture
  means nothing is emphasised; a field of equally bright blobs means
  everything is.
- **Specificity test** (Impeccable's question): *could an unrelated product
  ship this screen unchanged with a different logo?* If yes, the design has
  no point of view. That is not automatically a defect for a utility app, but
  it explains why a product feels forgettable — say so honestly.
- **Aesthetic-usability effect.** Users forgive more in interfaces they find
  attractive and trust ugly ones less. A visual finding is a usability
  finding when it costs trust; argue it that way.

## 2. Hierarchy

Question: does visual weight follow task priority?

- One primary action per view. Exactly one filled, high-contrast button. A
  second filled button is a competing primary (probe-heuristics `fitts`
  flags competing primaries; probe-perception `emphasis` counts emphasis
  inflation).
- Emphasis comes from size, weight, colour and position — in roughly that
  order of strength. De-emphasising secondary content (lighter grey, smaller,
  lighter weight) usually works better than shouting the primary content.
- Labels are secondary to values. In data-heavy screens (stats, sets, prices)
  the value should be the heaviest thing; "Weight:" in bold beside "80" in
  regular is backwards.
- Von Restorff: the thing that differs is remembered. Make sure the thing
  that differs is the thing that matters, not a promo banner.
- Headline should be ≥ ~1.6× body to carry hierarchy alone
  (probe-craft `typeScale.largestToBody`); below that it needs weight or
  colour help.

## 3. Typography

- **Scale.** A real type scale has 5–8 steps with a consistent ratio
  (1.125–1.333 for UI). probe-craft `typeScale.steps/adjacentRatios`;
  `muddySteps` (two sizes < 1.1× apart) are two sizes doing one job.
  probe-heuristics `designSystem.distinctFontSizes` > 10 means there is no
  scale, whatever the token file says.
- **Body size** 16px on mobile and desktop for reading text; 14px is fine for
  dense secondary UI on desktop, not for primary mobile content. Nothing
  essential below 12px.
- **Line height** 1.4–1.6 for body, tighter (1.1–1.25) for large headings.
  `normal` on paragraphs often means nobody set it.
- **Measure** 45–75 characters per line (probe-craft
  `paragraphMeasureChars`). Over ~90 on desktop is tiring to read.
- **Weights.** Two or three weights do the work: regular, medium/semibold,
  bold. Light weights at small sizes on dark backgrounds disappear.
- **Families.** One family is fine; two need a reason (display + text).
  Default system/Inter/Roboto everywhere is not wrong, but combined with other
  tells it reads as unconsidered (see §9).
- **Numbers.** Data-heavy UIs (timers, weights, scores) want tabular figures
  (`font-variant-numeric: tabular-nums`) so digits do not jitter as they
  change. Check timers and columns of numbers in the screenshot.
- **Case.** Pick sentence case or Title Case for UI labels and keep it.
  ALL CAPS only for short labels, with letter-spacing.

## 4. Spacing and rhythm

- **Base unit.** 4px base, 8px rhythm. ≥ 85% of spacing values on the 4px
  grid (probe-craft `gridDiscipline.pctOn4pxGrid`) indicates a system. Off-grid
  samples tell you where spacing was nudged by eye.
- **Proximity carries meaning.** Space inside a group < space between
  groups — typically 1:2 or more. probe-perception `proximity` measures this;
  confirm in the screenshot that the groups read as intended.
- **Start with too much white space, then remove.** Cramped UI is the
  commonest developer-made tell. Cards with 12px padding and 8px gaps on a
  data-dense screen feel nervous.
- **Vertical rhythm.** Repeated components (list rows, set rows, cards) must
  have identical heights and gaps. Any irregularity in a repeating pattern is
  very visible.
- **Edges.** A consistent outer gutter (16px on phones, 24–32px on tablets,
  centred max-width container on desktop).

## 5. Colour

- **Greys do most of the work.** A good palette has ~8–10 greys, a primary
  with 5–10 shades, and semantic colours (success, warning, danger). Pure
  #000 text on #fff or pure #000 backgrounds are harsh; slightly tinted
  neutrals feel designed (probe-craft `colourAndDepth.pageIsPureBlack`).
- **Colour should signal.** More than ~2 saturated hue families in UI chrome
  (probe-craft `saturatedHueBuckets`) usually means colour is decorating.
  The primary colour should mean "act here" or "this is progress".
- **Never colour alone.** Status (done, failed, PR) needs an icon, label or
  shape too.
- **Dark theme** is its own design, not inverted light: dark grey base
  (~#121212–#1c1c1e), elevated surfaces lighter, not shadowed; desaturated
  accents; text at ~87% / 60% opacity steps. Check both themes if both exist.
- **Contrast** numbers come from probe-core `contrast`; a designer's
  question on top: is the contrast *hierarchy* right (primary text strongest,
  secondary visibly weaker but still ≥ 4.5:1)?

## 6. Depth, shape, borders

- **Shadow scale** of 3–5 levels, used consistently by elevation (card <
  dropdown < modal). probe-craft `distinctShadows`.
- **Radius scale** small and consistent; nested radii should follow
  inner = outer − padding, otherwise corners look "off". One radius for
  everything (`uniformRadius`) is safe but flat.
- **Borders vs space vs background.** Prefer separating with space or a
  subtle background change before reaching for borders. Border + shadow +
  background on the same card is overkill.
- **Cards inside cards** (probe-craft `nestedCards`) almost always mean the
  layout was assembled from components rather than composed.

## 7. Iconography and imagery

- One icon set, one stroke weight, one size grid (16/20/24). Mixed sets are
  instantly visible.
- Emoji as UI icons (probe-craft `emojiAsIcons`) render differently per OS,
  cannot be coloured to the theme and read as placeholder. Fine in user
  content; weak in navigation and buttons.
- Icons beside labels, not instead of them, unless the icon is universal
  (search, close, back, more).
- Empty-state illustrations should be specific to the product or absent;
  generic stock illustration is a genericness tell.

## 8. Alignment and composition

- Everything aligns to something. probe-perception `alignment` counts
  distinct left edges; many near-identical edges (e.g. 16, 17, 18px) mean
  sloppy alignment.
- Left-aligned text for anything longer than a line; centred long text
  (probe-craft `centredLongText`) is harder to read.
- Composition on desktop: does the layout use the width (multi-column,
  list-detail, side panel), or is it a phone column floating in a sea of
  background (probe-craft `useOfWidth.stretchedMobileColumn`)?
- Density appropriate to the context: dashboards and tables can be dense on
  desktop; in-the-moment mobile flows must not be.

## 9. Genericness — does it look like *this* product?

The usual signature of a developer-built or AI-generated UI, in order of how
often it appears:

1. Default font everywhere (Inter/Roboto/system) with no typographic voice.
2. Purple-to-blue gradients, glassmorphism, glows used as decoration.
3. Cards nested in cards; every piece of content in a rounded bordered box.
4. Emoji as icons; generic illustrations.
5. One radius, one shadow, one accent — applied uniformly without hierarchy.
6. Centred hero with a headline, a subline and two buttons, on an app screen
   that is not a landing page.
7. Lots of muted grey labels, nothing that feels like the product's subject
   matter (a gym app that could be a to-do app).

Report genericness as a judgment, backed by the tells you measured and the
screenshot. The fix is never "add a gradient": it is a point of view — a
typographic choice, a colour that means something in the domain, imagery or
data visualisation specific to the subject, copy with a voice.

## 10. Polish signals

These are small, cheap and disproportionately responsible for "feels
premium":

- Hover, focus-visible, active and disabled states on every control
  (probe-heuristics `interactionStates`).
- Pressed feedback on touch (scale/opacity change) within 100ms.
- Skeletons sized like the content they replace; no layout shift on load.
- Truncation with ellipsis and full value available, never clipped text.
- Tabular numbers in timers and tables.
- Consistent iconography; optical alignment of icons with text baselines.
- Transitions 150–250ms ease-out for UI, nothing over 400ms for routine
  changes; `prefers-reduced-motion` respected (probe-craft `platform.motion`).
- Favicon, app icon, theme-color, title that names the screen.
- Focus never lost after an action (modal close returns focus).
- Destructive actions confirm or offer undo; undo is better.
