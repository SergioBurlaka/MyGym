/**
 * probe-craft.js — the measurable half of a designer's eye
 *
 * probe-heuristics.js counts how MANY distinct values a page uses. This probe
 * asks the questions a senior designer asks next: do those values sit on a
 * system (4/8 grid, a real type ratio), does the page read as a specific
 * product or as a default template, does it use the width it is given, and do
 * the inputs survive being used one-handed on a phone.
 *
 * Every field is a lead, not a verdict. A "tell" is a pattern that correlates
 * with generic, unconsidered UI — confirm it in the screenshot before writing
 * a finding, and never report the count alone.
 *
 * Run it in the page (evaluate the file contents). Returns a JSON string.
 */
(() => {
  const OUT = { url: location.href, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio };
  const all = [...document.body.querySelectorAll("*")];
  const rect = (el) => el.getBoundingClientRect();
  const visible = (el) => {
    const r = rect(el);
    if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  };
  const els = all.filter(visible);
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const c = (el.className && el.className.toString().trim().split(/\s+/)[0]) || "";
    if (c) s += "." + c.slice(0, 30);
    if (el.matches("input, select, textarea")) {
      const n = el.getAttribute("name") || el.getAttribute("placeholder") || el.getAttribute("aria-label");
      if (n) s += `[${n.slice(0, 24)}]`;
    }
    const t = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30);
    return t ? `${s} "${t}"` : s;
  };
  const px = (v) => parseFloat(v) || 0;
  const tally = (map, k) => map.set(k, (map.get(k) || 0) + 1);
  const top = (map, n = 12) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const parseRGB = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const toHSL = ({ r, g, b }) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: +s.toFixed(2), l: +l.toFixed(2) };
  };

  /* ============ 1. Grid discipline ============
   * A spacing system is a claim that every gap is a multiple of a base unit.
   * Off-grid values are the commonest sign that spacing was nudged by eye. */
  const spacingVals = new Map();
  const offGridSamples = [];
  let onGrid4 = 0, onGrid8 = 0, totalSpacing = 0;
  for (const el of els) {
    const cs = getComputedStyle(el);
    for (const prop of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "marginTop", "marginBottom", "rowGap", "columnGap"]) {
      const v = px(cs[prop]);
      if (v < 3 || v > 160) continue; // 1–2px are hairlines and focus offsets, not spacing
      totalSpacing++;
      tally(spacingVals, v);
      const r = Math.round(v);
      if (r % 4 === 0) onGrid4++;
      if (r % 8 === 0) onGrid8++;
      if (r % 4 !== 0 && r > 2 && offGridSamples.length < 10) offGridSamples.push(`${label(el)} ${prop}=${v}px`);
    }
  }
  OUT.gridDiscipline = {
    spacingDeclarations: totalSpacing,
    pctOn4pxGrid: totalSpacing ? Math.round((onGrid4 / totalSpacing) * 100) : null,
    pctOn8pxGrid: totalSpacing ? Math.round((onGrid8 / totalSpacing) * 100) : null,
    commonestValues: top(spacingVals, 10),
    offGridSamples,
    note: "Below ~85% on the 4px grid usually reads as 'spacing nudged by eye'. Check related items sit closer than unrelated ones in the screenshot before reporting.",
  };

  /* ============ 2. Type scale ============ */
  const sizes = new Map();
  const textEls = els.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  // Weight by the amount of text an element owns, so the body size wins over a single big headline.
  const ownChars = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).reduce((a, n) => a + n.textContent.trim().length, 0);
  const famWeight = new Map();
  for (const el of textEls) {
    const cs = getComputedStyle(el), w = ownChars(el);
    sizes.set(px(cs.fontSize), (sizes.get(px(cs.fontSize)) || 0) + w);
    const f = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    famWeight.set(f, (famWeight.get(f) || 0) + w);
  }
  const steps = [...sizes.keys()].sort((a, b) => a - b);
  const ratios = steps.slice(1).map((s, i) => +(s / steps[i]).toFixed(3));
  const muddy = steps.slice(1).map((s, i) => [steps[i], s]).filter(([a, b]) => b / a < 1.1 && b - a > 0);
  const bodyCandidate = top(sizes, 1)[0];
  const paras = textEls.filter((el) => el.matches("p, li, dd, blockquote") && (el.innerText || "").length > 80);
  const measures = paras.slice(0, 40).map((el) => {
    const fs = px(getComputedStyle(el).fontSize) || 16;
    return Math.round(rect(el).width / (fs * 0.5));
  });
  const bodyLH = paras[0] ? getComputedStyle(paras[0]).lineHeight : null;
  OUT.typeScale = {
    steps,
    adjacentRatios: ratios,
    muddySteps: muddy,
    bodySize: bodyCandidate ? { px: bodyCandidate[0], chars: bodyCandidate[1] } : null,
    largestToBody: bodyCandidate && steps.length ? +(steps[steps.length - 1] / bodyCandidate[0]).toFixed(2) : null,
    sub12pxTextCount: textEls.filter((el) => px(getComputedStyle(el).fontSize) < 12).length,
    paragraphMeasureChars: measures.length ? { min: Math.min(...measures), max: Math.max(...measures) } : null,
    bodyLineHeight: bodyLH,
    families: top(famWeight, 5).map(([f, c]) => [f, Math.round((c / ([...famWeight.values()].reduce((a, b) => a + b, 0) || 1)) * 100) + "%"]),
    note: "Adjacent steps under ~1.1× are indistinguishable: two sizes doing one job. A headline under ~1.6× the body size rarely creates hierarchy on its own. Comfortable measure is ~45–75 characters.",
  };

  /* ============ 3. Colour & depth ============ */
  const bgs = new Map(), accents = new Map(), shadows = new Map(), radii = new Map();
  let gradients = 0;
  const gradientSamples = [];
  for (const el of els) {
    const cs = getComputedStyle(el);
    const bg = parseRGB(cs.backgroundColor);
    if (bg && bg.a > 0.05) {
      const key = `rgb(${bg.r},${bg.g},${bg.b})`;
      tally(bgs, key);
      const hsl = toHSL(bg);
      if (hsl.s > 0.35 && hsl.l > 0.15 && hsl.l < 0.85) tally(accents, `${Math.round(hsl.h / 15) * 15}°`);
    }
    if (cs.backgroundImage && cs.backgroundImage.includes("gradient")) {
      gradients++;
      if (gradientSamples.length < 5) gradientSamples.push(`${label(el)}: ${cs.backgroundImage.slice(0, 90)}`);
    }
    if (cs.boxShadow && cs.boxShadow !== "none") tally(shadows, cs.boxShadow.slice(0, 80));
    const rad = cs.borderTopLeftRadius;
    if (rad && rad !== "0px") tally(radii, rad);
  }
  // Progress tracks / meters whose track is the same colour as what sits behind
  // it: only the fill is visible, so a 20% bar reads as a stray dash.
  const lum = (c) => [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
  const effectiveBg = (el) => { while (el) { const c = parseRGB(getComputedStyle(el).backgroundColor); if (c && c.a > 0.05) return c; el = el.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const tracks = els.filter((el) => { const r = rect(el); return r.height >= 2 && r.height <= 10 && r.width >= 30 && r.width > r.height * 4 && el.children.length >= 1 && px(getComputedStyle(el).borderTopLeftRadius) >= r.height / 2 - 1; });
  const invisibleTracks = tracks.map((el) => { const own = parseRGB(getComputedStyle(el).backgroundColor); const behind = effectiveBg(el.parentElement); return { el, cr: own && own.a > 0.05 ? ratio(own, behind) : 1 }; })
    .filter((t) => t.cr < 1.3);
  // Chart labels pushed outside an SVG that clips: tick labels cut off at the edge.
  const clippedSvgText = [];
  for (const svg of document.querySelectorAll("svg")) {
    if (!visible(svg) || getComputedStyle(svg).overflow === "visible") continue;
    const sr = rect(svg);
    for (const t of svg.querySelectorAll("text")) {
      const r = rect(t);
      if (r.width && (r.left < sr.left - 0.5 || r.right > sr.right + 0.5 || r.top < sr.top - 0.5 || r.bottom > sr.bottom + 0.5)) clippedSvgText.push(t.textContent.trim().slice(0, 20));
    }
  }
  OUT.dataViz = {
    invisibleTracks: { count: invisibleTracks.length, samples: invisibleTracks.slice(0, 4).map((t) => `${label(t.el)} track/background ${t.cr}:1`) },
    clippedSvgText: { count: clippedSvgText.length, samples: clippedSvgText.slice(0, 8) },
    note: "A progress track under ~1.3:1 against its background disappears and only the fill shows. Clipped tick labels usually mean the chart's left margin is too small for the widest label.",
  };

  const pageBg = parseRGB(getComputedStyle(document.body).backgroundColor) || parseRGB(getComputedStyle(document.documentElement).backgroundColor);
  OUT.colourAndDepth = {
    pageBackground: pageBg ? `rgb(${pageBg.r},${pageBg.g},${pageBg.b})` : "transparent",
    pageIsPureBlack: !!pageBg && pageBg.r + pageBg.g + pageBg.b === 0,
    pageIsPureWhite: !!pageBg && pageBg.r + pageBg.g + pageBg.b === 765,
    distinctBackgrounds: { count: bgs.size, values: top(bgs, 10) },
    saturatedHueBuckets: { count: accents.size, values: top(accents, 8) },
    gradients: { count: gradients, samples: gradientSamples },
    distinctShadows: { count: shadows.size, values: top(shadows, 6) },
    distinctRadii: { count: radii.size, values: top(radii, 6) },
    note: "More than ~2 saturated hue buckets usually means colour is decorating rather than signalling. A shadow scale wants 3–5 levels; 1 means no depth system, 8+ means none either.",
  };

  /* ============ 4. Genericness tells ============
   * Patterns that make an interface read as 'default template' or
   * 'developer-made'. Individually innocent; together they explain why a
   * product feels interchangeable. Confirm visually. */
  const isCard = (el) => {
    const cs = getComputedStyle(el);
    const hasEdge = (cs.boxShadow && cs.boxShadow !== "none") || (px(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none");
    return hasEdge && px(cs.borderTopLeftRadius) >= 6 && rect(el).width > 120 && rect(el).height > 60;
  };
  const cards = els.filter(isCard);
  const nestedCards = cards.filter((el) => { let p = el.parentElement; while (p && p !== document.body) { if (cards.includes(p)) return true; p = p.parentElement; } return false; });
  const emojiRe = /\p{Extended_Pictographic}/u;
  const emojiIcons = els.filter((el) => el.matches("button, a, h1, h2, h3, h4, li, span") && el.children.length === 0 && emojiRe.test(el.textContent || "") && (el.textContent || "").trim().length <= 4);
  const centred = textEls.filter((el) => getComputedStyle(el).textAlign === "center" && (el.innerText || "").length > 60).length;
  const fam = OUT.typeScale.families.map(([f]) => f.toLowerCase());
  const purpleBlue = gradientSamples.filter((s) => /rgb\((1[0-4]\d|[6-9]\d), ?\d+, ?2[0-5]\d\)/.test(s)).length;
  OUT.genericnessTells = {
    dominantDefaultFamily: fam.length && parseInt(OUT.typeScale.families[0][1]) >= 85 && /^(inter|roboto|arial|helvetica|system-ui|-apple-system|segoe ui|sans-serif|open sans)$/.test(fam[0]) ? OUT.typeScale.families[0].join(" ") : null,
    nestedCards: { count: nestedCards.length, samples: nestedCards.slice(0, 5).map(label) },
    cardCount: cards.length,
    emojiAsIcons: { count: emojiIcons.length, samples: emojiIcons.slice(0, 6).map(label) },
    centredLongText: centred,
    purpleBlueGradients: purpleBlue,
    uniformRadius: radii.size === 1 ? [...radii.keys()][0] : null,
    note: "None of these is a defect alone. Three or more together, plus a screenshot that 'could belong to any product', is the evidence for a genericness finding.",
  };

  /* ============ 5. Use of width (desktop) / fit (mobile) ============ */
  const main = document.querySelector("main, [role=main]") || document.body;
  const blocks = [...main.querySelectorAll("section, article, form, [class*=container], [class*=content], main > div")].filter(visible);
  const widest = blocks.reduce((m, el) => Math.max(m, rect(el).width), 0);
  const wideForms = [...document.querySelectorAll("form")].filter(visible).filter((f) => rect(f).width > 760).map(label).slice(0, 4);
  const wideInputs = [...document.querySelectorAll("input, textarea, select")].filter(visible).filter((i) => rect(i).width > 640).length;
  OUT.useOfWidth = {
    viewportWidth: innerWidth,
    widestContentBlock: Math.round(widest),
    contentFillRatio: +(widest / innerWidth).toFixed(2),
    stretchedMobileColumn: innerWidth >= 1200 && widest > 0 && widest < 640,
    overStretchedForms: wideForms,
    inputsWiderThan640: wideInputs,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    note: "At ≥1200px a lone column under ~640px is a phone layout on a monitor; forms and inputs over ~640px are hard to scan. On mobile any horizontal overflow is a defect.",
  };

  /* ============ 6. Input ergonomics (one-handed, sweaty, in a hurry) ============ */
  const inputs = [...document.querySelectorAll("input, select, textarea")].filter(visible)
    .filter((i) => !["hidden", "checkbox", "radio", "submit", "button"].includes(i.type));
  const numericLike = inputs.filter((i) => i.type === "number" || /weight|reps?|kg|lb|sets?|вага|повт|підх|amount|qty|count|duration/i.test(`${i.name} ${i.id} ${i.placeholder} ${i.getAttribute("aria-label") || ""}`));
  OUT.inputErgonomics = {
    inputs: inputs.length,
    under16pxFont: inputs.filter((i) => px(getComputedStyle(i).fontSize) < 16).map(label).slice(0, 8),
    under44pxTall: inputs.filter((i) => rect(i).height < 44).map((i) => `${label(i)} h=${Math.round(rect(i).height)}`).slice(0, 8),
    numericFields: numericLike.slice(0, 12).map((i) => ({
      field: label(i), type: i.type, inputmode: i.getAttribute("inputmode"), step: i.getAttribute("step"),
      pattern: i.getAttribute("pattern"), fontPx: px(getComputedStyle(i).fontSize), heightPx: Math.round(rect(i).height),
    })),
    note: "iOS zooms into inputs under 16px. Weights need decimals: type=number with step='any' or inputmode='decimal' — and a comma-locale keyboard (uk, de) types ',' which type=number may silently reject.",
  };

  /* ============ 7. Theming, motion, platform ============ */
  let darkRules = 0, reducedMotion = 0, hoverNone = 0, coarse = 0, readable = 0, blocked = 0;
  const walk = (rules) => {
    for (const r of rules) {
      if (r.media) {
        const m = r.media.mediaText || "";
        if (/prefers-color-scheme:\s*dark/.test(m)) darkRules++;
        if (/prefers-reduced-motion/.test(m)) reducedMotion++;
        if (/hover:\s*none/.test(m)) hoverNone++;
        if (/pointer:\s*coarse/.test(m)) coarse++;
      }
      if (r.cssRules) try { walk(r.cssRules); } catch { /* ignore */ }
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules); readable++; } catch { blocked++; } }
  const animated = els.filter((el) => { const cs = getComputedStyle(el); return (cs.transitionDuration && cs.transitionDuration !== "0s") || (cs.animationName && cs.animationName !== "none"); });
  const themeAttr = document.documentElement.getAttribute("data-theme") || document.documentElement.className.match(/\b(dark|light)\b/)?.[0] || null;
  OUT.platform = {
    darkMode: { mediaRules: darkRules, colorSchemeProp: getComputedStyle(document.documentElement).colorScheme || null, themeAttrOrClass: themeAttr, metaColorScheme: document.querySelector('meta[name="color-scheme"]')?.content || null },
    motion: { elementsWithTransitionOrAnimation: animated.length, prefersReducedMotionRules: reducedMotion },
    touchAwareCss: { hoverNoneRules: hoverNone, pointerCoarseRules: coarse },
    pwa: { manifest: !!document.querySelector('link[rel="manifest"]'), themeColor: document.querySelector('meta[name="theme-color"]')?.content || null, serviceWorkerControlling: !!(navigator.serviceWorker && navigator.serviceWorker.controller), wakeLockSupported: "wakeLock" in navigator },
    safeArea: { viewportFitCover: /viewport-fit=cover/.test(document.querySelector('meta[name="viewport"]')?.content || "") },
    stylesheets: { readable, blocked },
    note: "These detect support, not quality. wakeLockSupported is the browser, not the app — check the code or watch the screen during a rest timer to know whether the app actually requests a lock.",
  };

  return JSON.stringify(OUT, null, 1);
})();
