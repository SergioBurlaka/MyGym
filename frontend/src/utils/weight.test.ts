import { afterEach, describe, expect, it, vi } from 'vitest';

// Only the current language matters to the formatters - no real i18next.
const lang = vi.hoisted(() => ({ language: 'uk' }));
vi.mock('../i18n/index.js', () => ({ default: lang }));

import { formatCompactNumber, formatDecimal, formatKg, formatStepKg } from './weight.js';

describe.each(['uk', 'en'])('number format (%s): decimal point, no thousands separator', (language) => {
  afterEach(() => {
    lang.language = 'uk';
  });

  it('formats a weight as it is, up to 2 decimals', () => {
    lang.language = language;
    expect(formatKg(40.5)).toBe('40.5');
    expect(formatKg(16.25)).toBe('16.25');
    expect(formatKg(20)).toBe('20');
    expect(formatKg(32.499999)).toBe('32.5');
    expect(formatKg(1728)).toBe('1728');
    expect(formatKg(172063)).toBe('172063');
  });

  it('formats a weight step with 2 decimals', () => {
    lang.language = language;
    expect(formatStepKg(0.5)).toBe('0.50');
    expect(formatStepKg(1.25)).toBe('1.25');
    expect(formatStepKg(0)).toBe('0.00');
  });

  it('formats tonnes and compact axis labels with a point', () => {
    lang.language = language;
    expect(formatDecimal(16.14, 1)).toBe('16.1');
    expect(formatCompactNumber(1500)).toMatch(/^1\.5/);
    expect(formatCompactNumber(12000)).not.toMatch(/,/);
  });
});
