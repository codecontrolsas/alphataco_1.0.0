/**
 * Color de texto (#0a0a0a o #ffffff) con mejor contraste sobre un fondo hex, por luminancia relativa WCAG.
 * Las casillas de novedad del calendario usan el color del tipo de diagrama como fondo.
 */
export function getContrastTextColor(hex: string): '#0a0a0a' | '#ffffff' {
  const match = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!match) return '#0a0a0a';

  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  // Con luminancia > ~0,179 el texto oscuro da el mejor contraste (≥ 4,5:1).
  return luminance > 0.179 ? '#0a0a0a' : '#ffffff';
}
