import {
  getContrastRatio,
  hexToRelativeLuminance,
  isWcagAA,
} from './wcag.helper';

describe('WcagHelper', () => {
  describe('hexToRelativeLuminance', () => {
    it('returns 1 for white (#FFFFFF)', () => {
      expect(hexToRelativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    });

    it('returns 0 for black (#000000)', () => {
      expect(hexToRelativeLuminance('#000000')).toBeCloseTo(0, 5);
    });
  });

  describe('getContrastRatio', () => {
    it('returns ~21:1 for black (#000000) against white', () => {
      expect(getContrastRatio('#000000')).toBeCloseTo(21, 0);
    });

    it('returns 1:1 for white (#FFFFFF) against white', () => {
      expect(getContrastRatio('#FFFFFF')).toBeCloseTo(1, 5);
    });
  });

  describe('isWcagAA', () => {
    it('returns true for black (#000000) — contrast 21:1', () => {
      expect(isWcagAA('#000000')).toBe(true);
    });

    it('returns false for white (#FFFFFF) — contrast 1:1', () => {
      expect(isWcagAA('#FFFFFF')).toBe(false);
    });

    it('returns true for default primary blue (#1A56DB) — contrast ≥ 4.5:1', () => {
      expect(isWcagAA('#1A56DB')).toBe(true);
    });

    it('returns false for yellow (#FFFF00) — low contrast against white', () => {
      expect(isWcagAA('#FFFF00')).toBe(false);
    });

    it('returns false for #777777 — borderline below 4.5:1', () => {
      // #777777 has contrast ratio ≈ 4.48:1 — just below threshold
      expect(isWcagAA('#777777')).toBe(false);
    });

    it('returns true for dark blue (#003366) — high contrast', () => {
      expect(isWcagAA('#003366')).toBe(true);
    });
  });
});
