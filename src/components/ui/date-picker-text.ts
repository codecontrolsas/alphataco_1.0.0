import moment from 'moment';
import 'moment/locale/es';

/**
 * Lógica pura del texto de `DatePicker`: máscara, parseo con moment, límites y mensajes. Sin React, así el
 * componente queda en la interacción y esto se puede leer (y probar) aparte.
 */

export type DatePickerGranularity = 'day' | 'month';

/** Reglas cruzadas (fin ≥ inicio, etc.). En `month` se evalúa sobre el día 1. */
export type IsDateDisabled = ((date: Date) => boolean) | undefined;

export type Bounds = { min?: Date; max?: Date; conflict: boolean };

export type Evaluation =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'valid'; date: Date };

// Patrones numéricos: no dependen del locale global de moment (`fase-2-primitivos.md` §2.3).
export const DISPLAY_FORMAT: Record<DatePickerGranularity, string> = { day: 'DD/MM/YYYY', month: 'MM/YYYY' };
export const PLACEHOLDER: Record<DatePickerGranularity, string> = { day: 'DD/MM/AAAA', month: 'MM/AAAA' };
const PARSE_FORMATS: Record<DatePickerGranularity, string[]> = {
  day: ['DD/MM/YYYY', 'D/M/YYYY', 'YYYY-MM-DD'],
  month: ['MM/YYYY', 'M/YYYY', 'YYYY-MM'],
};
const MAX_DIGITS: Record<DatePickerGranularity, number> = { day: 8, month: 6 };
export const UNIT: Record<DatePickerGranularity, 'day' | 'month'> = { day: 'day', month: 'month' };
const NON_DIGITS = /\D/g;
/** Un segmento de un dígito que el usuario cerró con `/` se completa con 0 (`7/` → `07/`). */
const SINGLE_DIGIT_SEGMENT = /(?<!\d)(\d)\//g;
export const MONTH_LABELS = moment
  .localeData('es')
  .monthsShort()
  .map((label) => label.replace('.', ''));
export const MONTH_NAMES = moment.localeData('es').months();

export function formatDate(date: Date | null, granularity: DatePickerGranularity): string {
  return date ? moment(date).format(DISPLAY_FORMAT[granularity]) : '';
}

export function sameUnit(a: Date | null, b: Date | null, granularity: DatePickerGranularity): boolean {
  if (!a || !b) return a === b;
  return moment(a).isSame(b, UNIT[granularity]);
}

export function resolveBounds(min: Date | undefined, max: Date | undefined): Bounds {
  if (min && max && moment(min).isAfter(max, 'day')) return { conflict: true };
  return { min, max, conflict: false };
}

/** Normaliza lo tipeado o pegado: solo dígitos, con las barras insertadas solas. */
export function maskText(raw: string, granularity: DatePickerGranularity): string {
  const pasted = moment(raw.trim(), PARSE_FORMATS[granularity], true);
  if (pasted.isValid()) return pasted.format(DISPLAY_FORMAT[granularity]);

  const digits = raw.replace(SINGLE_DIGIT_SEGMENT, '0$1/').replace(NON_DIGITS, '').slice(0, MAX_DIGITS[granularity]);
  if (digits.length <= 2) return digits;
  if (granularity === 'month' || digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function countDigits(text: string): number {
  return text.replace(NON_DIGITS, '').length;
}

/** Posición del cursor justo después del dígito número `digits` de `text`. */
export function caretAfterDigits(text: string, digits: number): number {
  if (digits === 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '/' && ++seen === digits) return i + 1;
  }
  return text.length;
}

export function boundLabel(date: Date, granularity: DatePickerGranularity): string {
  return granularity === 'day' ? `el ${formatDate(date, 'day')}` : formatDate(date, 'month');
}

export function getUnavailableReason(
  date: Date,
  granularity: DatePickerGranularity,
  bounds: Bounds,
  isDateDisabled: IsDateDisabled
): string | null {
  const noun = granularity === 'day' ? 'La fecha' : 'El mes';
  if (bounds.min && moment(date).isBefore(bounds.min, UNIT[granularity])) {
    return `${noun} tiene que ser desde ${boundLabel(bounds.min, granularity)}`;
  }
  if (bounds.max && moment(date).isAfter(bounds.max, UNIT[granularity])) {
    return `${noun} tiene que ser hasta ${boundLabel(bounds.max, granularity)}`;
  }
  if (isDateDisabled?.(date)) return `${noun} ${formatDate(date, granularity)} no está disponible`;
  return null;
}

export function evaluateText(
  text: string,
  granularity: DatePickerGranularity,
  bounds: Bounds,
  isDateDisabled: IsDateDisabled
): Evaluation {
  if (!text) return { kind: 'empty' };
  const parsed = moment(text, PARSE_FORMATS[granularity], true);
  if (!parsed.isValid()) return { kind: 'invalid' };
  const date = parsed.startOf(UNIT[granularity]).toDate();
  const reason = getUnavailableReason(date, granularity, bounds, isDateDisabled);
  return reason ? { kind: 'unavailable', reason } : { kind: 'valid', date };
}

/** Decisión 7.3: lo escrito que no sirve se descarta, se vuelve al último valor válido y se avisa. */
export function buildRevertMessage(
  evaluation: Evaluation,
  text: string,
  value: Date | null,
  granularity: DatePickerGranularity
): string {
  const kept = value ? `se mantiene ${formatDate(value, granularity)}` : 'el campo quedó vacío';
  if (evaluation.kind === 'unavailable') return `${evaluation.reason}; ${kept}.`;
  return `No se reconoció «${text}» (escribila como ${PLACEHOLDER[granularity]}); ${kept}.`;
}
