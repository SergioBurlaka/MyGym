# Eyes and breakpoints — choosing a browser, and reviewing desktop vs mobile

## Contents
1. Browser tiers: which tool gives true mobile emulation
2. Per-tool recipes
3. Login-protected apps
4. The capture matrix
5. Mobile review checklist
6. Tablet
7. Desktop review checklist
8. What emulation can never show

---

## 1. Browser tiers

A narrow desktop window is **not** a phone. Without `isMobile` the page
ignores the meta viewport; without touch, `@media (hover: none)` and
`(pointer: coarse)` never match; without DPR, hairlines and icon crispness
are wrong; without a mobile UA, server-side device switches do not fire.
Pick the highest tier available and state the tier in the report.

| Tier | Tool | Mobile fidelity | Notes |
|---|---|---|---|
| A | **Chrome DevTools MCP** (`emulate` tool) | isMobile, touch, DPR, UA, dark/light, network (Offline, Slow 3G), CPU | Switch mid-session. `--autoConnect` attaches to the user's signed-in Chrome. Also `lighthouse_audit` with mobile/desktop, `take_screenshot` with fullPage. |
| A | **Playwright MCP** started with `--device "iPhone 15"` (or Pixel) | Same, fixed per server launch | Run a second server entry for desktop (`--viewport-size 1440,900`). `--storage-state auth.json` for login. |
| A | **`scripts/capture.py`** (Python Playwright) | isMobile, touch, DPR 3, mobile UA, light/dark | No MCP needed; screenshots + probe-craft for every cell. Cannot click through flows — pair with any browser for interaction. |
| B | Desktop app **built-in browser**, `resize_window` with `preset: "mobile"` (or any width < 768) | Mobile UA (Android Chrome), `pointer: coarse`, DPR ~2 — but `maxTouchPoints` read 0 in testing and clicks arrive as mouse clicks | Usually already signed in (persistent profile). Reload after switching so load-time checks re-run. `colorScheme` light/dark per tab. Good enough for mobile layout, recomposition and coarse-pointer CSS; verify JS touch-event code paths on a real phone. |
| C | **Claude in Chrome** `resize_window` | Width only; cannot go below ~500px; side panel eats width | Good for signed-in desktop flows, console, real interaction. Label every mobile finding from this tier "narrow-window approximation" and do not make touch/hover claims. |

How to tell what you have: look at the tool list. `emulate` or a Playwright
server with a device flag → tier A. Only `resize_window` → tier C; check
whether Python Playwright is installed (`python3 -c "import playwright"`) and
whether the URL is reachable from the shell — if so, `capture.py` lifts you
to tier A for screenshots and probes.

If only tier C is available, still review mobile, but say plainly which
mobile behaviours were not verifiable and suggest the one-time check on a
real phone (Android: `chrome://inspect` remote debugging; iOS: Safari Web
Inspector).

## 2. Per-tool recipes

**Chrome DevTools MCP**
- Mobile: `emulate` with viewport `{width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true}`, a mobile UA, `colorScheme` light then dark.
- Desktop: `emulate` with `{width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false}`.
- Offline/slow: network conditions `Offline` or `Slow 3G` to provoke loading and error states.
- Run probes with `evaluate_script` (paste the probe file contents).
- Install (Claude Code): `claude mcp add chrome-devtools --scope user -- npx chrome-devtools-mcp@latest --autoConnect` (Chrome 144+, enable remote debugging at `chrome://inspect/#remote-debugging`), or the official plugin marketplace `ChromeDevTools/chrome-devtools-mcp`.

**Playwright MCP**
- `claude mcp add pw-mobile -- npx @playwright/mcp@latest --device "iPhone 15" --isolated --storage-state auth.json`
- `claude mcp add pw-desktop -- npx @playwright/mcp@latest --viewport-size 1440,900 --isolated --storage-state auth.json`
- `browser_resize` on the desktop server is width-only — do not use it as "mobile".
- Probes: `browser_evaluate` with the probe source.

**capture.py**
- `python3 scripts/capture.py <url> [<url>…] --out shots --storage-state auth.json [--tablet]`
- First-time login: `python3 scripts/capture.py --login <url> --storage-state auth.json` opens a headed browser for the user to sign in.
- Read `shots/index.json`, then view the PNGs and the `__craft.json` per cell.

**Built-in browser (desktop app)**
- Load the `built-in-browser` skill first; it covers site approval and sign-in.
- Desktop: `resize_window` width 1440, height 900. Mobile: `preset: "mobile"` (375×812), then reload. Finish with `preset: "desktop"` to clear the emulation.
- Screenshots are drawn at the pane's size, so a 1440 layout comes back scaled down. Right after a resize or navigation the first screenshot can be stale or cropped, or time out: wait 1–2 s and take it again. Use `zoom` on a region to inspect detail. If the pane is hidden or minimised, screenshots time out — ask the user to bring the Browser pane forward, and keep measuring through the JavaScript tool meanwhile.

**Claude in Chrome**
- Load the `chrome-browser` skill first.
- `resize_window` to 1440×900 for desktop; for mobile, the narrowest it allows, labelled as an approximation.

**Running probes efficiently in any browser**
Probe files are long; pasting each one for every screen wastes context. Inject once per page load as functions — `window.__sdr_craft = () => <contents of probe-craft.js without the trailing semicolon>` (same for the others) — then call them after each in-app navigation and return only the fields you need. In a single-page app the functions survive client-side navigation. To survive a full reload, stash the source once: `localStorage.setItem('__sdr_src', 'window.__sdr_craft=' + window.__sdr_craft.toString())`, restore with `eval(localStorage.getItem('__sdr_src'))` (works through DevTools-style evaluation even under a strict CSP), and **remove the key when the review ends** — it is the user's app storage.

## 3. Login-protected apps

Never type the user's password, and never put it in a script or a storage
file you create. Options, best first:
1. Attach to the user's own signed-in browser (DevTools MCP `--autoConnect`,
   Claude in Chrome, built-in browser with persistent sign-in).
2. The user signs in once in a headed window (`capture.py --login`, or a
   Playwright MCP headed run) and the session is saved to `auth.json`.
3. A local dev build with a seed/test account from the project's own files.
Google OAuth often refuses automated browsers; options 1 and 2 avoid that.
Prefer a test account: everything on screen goes into the model's context.

## 4. The capture matrix

Minimum: **mobile 390×844 and desktop 1440×900, light and (if supported) dark,**
for 3–6 key screens. Add 768 (tablet) when the layout has a distinct tablet
state, and 1280 if the desktop layout looks tight. For each cell keep:
first-viewport screenshot, full-page screenshot, probe-craft JSON. Name the
cells consistently so findings can cite them ("workout · mobile-390 · dark").

Pick key screens by user value, not by route count: the first screen after
login, the core task screen (in a tracker: the active workout), the screen
that shows progress/results, one settings/form screen, and one empty state.

## 5. Mobile review checklist

Mobile is a different composition, not a smaller one.

- **Navigation pattern.** 3–5 top destinations → bottom tab bar (HIG,
  Material navigation bar). Hamburger-only navigation for core destinations
  costs discoverability.
- **Primary action placement.** Sticky bottom action bar or FAB for the main
  repeated action; above the keyboard when a form is open. Reach: the lower
  and central screen is easiest to tap; avoid putting the most frequent action
  only in the top corners. (Hoober's grip data — about half of use is
  one-handed — still holds; his old thumb-zone diagrams were withdrawn, so
  argue reach from frequency, not from a heat-map picture.)
- **Recomposition.** Tables become cards or stacked rows; side panels become
  separate screens or bottom sheets; modals become full-screen sheets; hover
  reveals become always-visible or long-press.
- **Targets.** ≥ 44×44pt (Apple) / 48×48dp (Material), with ≥ 8px between
  adjacent targets (probe-core `tapTargets`).
- **Keyboard.** The right keyboard per field (`inputmode`), the focused field
  not hidden by the keyboard, Done/Next sensible (probe-craft
  `inputErgonomics`). Inputs ≥ 16px or iOS zooms.
- **Safe areas.** Content clear of notch and home indicator; bottom bars pad
  with `env(safe-area-inset-bottom)` (`viewport-fit=cover` detected by
  probe-craft `platform.safeArea`).
- **Overflow.** No horizontal scroll anywhere (probe-craft
  `useOfWidth.horizontalOverflow`, probe-core `layout`).
- **Text scaling.** Layout survives ~200% text size without clipping.
- **Hover-only affordances** must have a touch equivalent.
- **Density.** Fewer, larger elements per screen; progressive disclosure.

## 6. Tablet

Check only if the layout changes there. Common failure: phone layout
stretched to 768px with giant buttons, or desktop layout squeezed with tiny
targets. Material suggests a navigation rail on medium widths.

## 7. Desktop review checklist

Desktop is where people plan, compare and analyse.

- **Use of width.** Multi-column, list-detail or a side panel; content max
  width ~1200–1400px; reading text constrained to a comfortable measure.
  A single ≤ 640px column at 1440px (probe-craft `stretchedMobileColumn`) is a
  phone layout on a monitor.
- **Density.** Tables, charts and comparisons can be denser; whitespace
  should group, not pad.
- **Hover and focus.** Every interactive element shows hover, focus-visible
  and pressed states; tooltips for icon-only buttons.
- **Keyboard.** Logical tab order, visible focus, shortcuts for frequent
  actions in power-user apps.
- **Forms.** Inputs sized to their expected content, not full-width
  (probe-craft `inputsWiderThan640`).
- **Navigation.** Persistent side or top navigation; current location
  obvious.

## 8. What emulation can never show

Even tier A is Chromium. It will not reproduce: iOS Safari `100vh` and
toolbar behaviour, input auto-zoom exactly, safe-area insets on a real notch,
PWA standalone mode and Add to Home Screen, real keyboard overlap, haptics,
real-world glare and gloves. Put these in a short "verify on a real device"
list at the end of the report instead of guessing.
