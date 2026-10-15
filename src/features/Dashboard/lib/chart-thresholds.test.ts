import { describe, expect, it } from 'vitest';
import {
  THRESHOLD_DOT_ABOVE_COLOR,
  THRESHOLD_DOT_NEUTRAL_COLOR,
  THRESHOLD_DOT_WITHIN_COLOR,
  isAboveThreshold,
  thresholdDotColor,
} from './chart-thresholds';

describe('isAboveThreshold', () => {
  it('es true sólo por encima del umbral', () => {
    expect(isAboveThreshold(80.1, 80)).toBe(true);
    expect(isAboveThreshold(120, 80)).toBe(true);
  });

  it('el valor exacto del umbral cuenta como dentro de lo esperado', () => {
    expect(isAboveThreshold(80, 80)).toBe(false);
  });

  it('un valor ausente o no numérico cuenta como dentro de lo esperado', () => {
    expect(isAboveThreshold(undefined, 80)).toBe(false);
    expect(isAboveThreshold(null, 80)).toBe(false);
    expect(isAboveThreshold('95', 80)).toBe(false);
    expect(isAboveThreshold(Number.NaN, 80)).toBe(false);
  });
});

describe('thresholdDotColor', () => {
  it('pinta de rojo por encima del umbral y de verde el resto', () => {
    expect(thresholdDotColor(95, 80)).toBe(THRESHOLD_DOT_ABOVE_COLOR);
    expect(thresholdDotColor(10, 80)).toBe(THRESHOLD_DOT_WITHIN_COLOR);
    expect(thresholdDotColor(undefined, 80)).toBe(THRESHOLD_DOT_NEUTRAL_COLOR);
  });
});
