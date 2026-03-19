/**
 * WCAG 2.1 AA contrast ratio helpers.
 * Reference: https://www.w3.org/TR/WCAG21/#contrast-minimum
 *
 * Minimum contrast ratio for normal text: 4.5:1 (Level AA)
 * All checks are performed against white background (#FFFFFF).
 */

/**
 * Convert a hex color to its relative luminance (per WCAG spec).
 */
export function hexToRelativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const linearize = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Compute contrast ratio of a color against white (#FFFFFF).
 */
export function getContrastRatio(hex: string): number {
  const L1 = 1; // relative luminance of #FFFFFF
  const L2 = hexToRelativeLuminance(hex);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns true if the color meets WCAG 2.1 Level AA contrast (≥ 4.5:1 against white).
 */
export function isWcagAA(hex: string): boolean {
  return getContrastRatio(hex) >= 4.5;
}
