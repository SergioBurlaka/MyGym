import { afterEach, describe, expect, it, vi } from 'vitest';

// Only the current language matters to the formatters - no real i18next.
const lang = vi.hoisted(() => ({ language: 'uk' }));
vi.mock('../i18n/index.js', () => ({ default: lang }));

import { formatCompactNumber, formatDecimal, formatKg, formatStepKg, lastFilledSet, stepWeight } from './weight.js';

describe('lastFilledSet', () => {
  it('finds the last set with a whole number', () => {
    expect(lastFilledSet(['10', '9', ''])).toBe(1);
    expect(lastFilledSet(['10', '', '8'])).toBe(2);
    expect(lastFilledSet([' 5 ', '  '])).toBe(0);
    expect(lastFilledSet(['0'])).toBe(0);
  });

  it('skips what would not be saved', () => {
    expect(lastFilledSet(['10', '5.5'])).toBe(0);
    expect(lastFilledSet(['10', '-3'])).toBe(0);
    expect(lastFilledSet(['10', 'abc'])).toBe(0);
  });

  it('is -1 without a filled set', () => {
    expect(lastFilledSet(['', ' '])).toBe(-1);
    expect(lastFilledSet([])).toBe(-1);
  });
});

describe('stepWeight', () => {
  it('moves by the step in both directions', () => {
    expect(stepWeight(30, 1.25, 1)).toBe(31.25);
    expect(stepWeight(8, 0.5, 1)).toBe(8.5);
    expect(stepWeight(30, 1.25, -1)).toBe(28.75);
  });

  it('keeps whole hundredths', () => {
    expect(stepWeight(0.1, 0.2, 1)).toBe(0.3);
    expect(stepWeight(1.1, 0.1, 1)).toBe(1.2);
  });

  it('stays within 0 and the limit of 500', () => {
    expect(stepWeight(0.5, 1.25, -1)).toBe(0);
    expect(stepWeight(499.5, 1.25, 1)).toBe(500);
  });
});

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
