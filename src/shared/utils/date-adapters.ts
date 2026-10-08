import moment from 'moment';

/**
 * Tipo de valor que guarda un campo de fecha en su form. `DatePicker` trabaja siempre con `Date | null`;
 * el adaptador traduce de y hacia lo que el form ya espera hoy, para que migrar un campo no cambie el payload.
 *
 * | Formato               | Valor en el form                           | Vacío por defecto | Usos de hoy                                   |
 * |-----------------------|--------------------------------------------|-------------------|-----------------------------------------------|
 * | `date`                | `Date` (medianoche local)                  | `null`            | Calendar a mano, Enhanced con `Date`           |
 * | `iso-date`            | `'YYYY-MM-DD'` (día local)                 | `''`              | `type="date"` con `{...field}`, Invoice, AFIP  |
 * | `iso-datetime`        | `toISOString()` de la medianoche local     | `''`              | `UploadDocumentMulti*` (validity)              |
 * | `month`               | `'YYYY-MM'`                                | `''`              | períodos de documentos (`type="month"`)        |
 * | `month-date`          | `Date` del día 1 del mes (medianoche local)| `null`            | `YearMonthPicker` de los gráficos de RRHH      |
 * | `iso-date-utc`        | `Date` de `new Date('YYYY-MM-DD')` (UTC)   | `null`            | `CustomerForm` (fecha de baja), decisión 7.8   |
 * | `iso-date-utc-string` | `'YYYY-MM-DD'`; se lee por el día UTC      | `''`              | `Formularios/.../Inputs.tsx` (DateInput), 7.8  |
 *
 * Los dos `*-utc*` conservan a propósito el comportamiento actual (el día leído en UTC puede correr uno en
 * Argentina): corregirlo cambia el payload y va por ticket aparte (`fase-2-primitivos.md` §7.8).
 */
export type DateFieldFormat =
  | 'date'
  | 'iso-date'
  | 'iso-datetime'
  | 'month'
  | 'month-date'
  | 'iso-date-utc'
  | 'iso-date-utc-string';

/** Lo que un campo de fecha puede guardar, según su formato. */
export type DateFieldValue = Date | string | null | undefined;

/** Lo que guarda el campo cuando queda vacío. */
export type DateEmptyValue = null | '' | undefined;

const ISO_DATE = 'YYYY-MM-DD';
const ISO_MONTH = 'YYYY-MM';

/** Granularidad con la que el picker muestra cada formato. */
export const DATE_FORMAT_GRANULARITY: Record<DateFieldFormat, 'day' | 'month'> = {
  date: 'day',
  'iso-date': 'day',
  'iso-datetime': 'day',
  month: 'month',
  'month-date': 'month',
  'iso-date-utc': 'day',
  'iso-date-utc-string': 'day',
};

/** Vacío que guarda hoy cada formato cuando el consumidor no indica otro. */
export const DEFAULT_EMPTY_VALUE: Record<DateFieldFormat, DateEmptyValue> = {
  date: null,
  'iso-date': '',
  'iso-datetime': '',
  month: '',
  'month-date': null,
  'iso-date-utc': null,
  'iso-date-utc-string': '',
};

function validOrNull(parsed: moment.Moment): Date | null {
  return parsed.isValid() ? parsed.toDate() : null;
}

/** Fecha local con el mismo día calendario que `date` tiene en UTC. */
function utcDayAsLocal(date: Date): Date | null {
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Lee un `Date` o un string con `moment` (ISO 8601, como hacía `EnhancedDatePicker`). */
function parseLoose(raw: Date | string): moment.Moment {
  return raw instanceof Date ? moment(raw) : moment(raw, moment.ISO_8601, true);
}

/**
 * Valor del form → `Date | null` para el picker (siempre medianoche local; en los formatos de mes, el día 1).
 * Un valor que no se puede leer devuelve `null`: el picker lo muestra vacío.
 */
export function toPickerDate(raw: DateFieldValue, format: DateFieldFormat): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;

  switch (format) {
    case 'iso-date': {
      const parsed = raw instanceof Date ? moment(raw) : moment(raw, ISO_DATE, true);
      return validOrNull(parsed.startOf('day'));
    }
    case 'month': {
      const parsed = raw instanceof Date ? moment(raw) : moment(raw, ISO_MONTH, true);
      return validOrNull(parsed.startOf('month'));
    }
    case 'month-date':
      return validOrNull(parseLoose(raw).startOf('month'));
    case 'iso-date-utc':
    case 'iso-date-utc-string':
      // Mismo criterio que hoy: `new Date(value).toISOString().split('T')[0]`.
      return utcDayAsLocal(raw instanceof Date ? raw : new Date(raw));
    case 'date':
    case 'iso-datetime':
      return validOrNull(parseLoose(raw).startOf('day'));
  }
}

/**
 * `Date | null` del picker → valor del form. `null` devuelve `options.emptyValue` si se pasa (aunque sea
 * `undefined`); si no, el vacío de hoy de cada formato (`DEFAULT_EMPTY_VALUE`).
 */
export function fromPickerDate(
  date: Date | null,
  format: DateFieldFormat,
  options?: { emptyValue: DateEmptyValue }
): DateFieldValue {
  if (!date || Number.isNaN(date.getTime())) return options ? options.emptyValue : DEFAULT_EMPTY_VALUE[format];

  switch (format) {
    case 'date':
      return moment(date).startOf('day').toDate();
    case 'iso-date':
    case 'iso-date-utc-string':
      return moment(date).format(ISO_DATE);
    case 'iso-datetime':
      // Idéntico a `date?.toISOString()` sobre la medianoche local que emitía `EnhancedDatePicker`.
      return moment(date).startOf('day').toDate().toISOString();
    case 'month':
      return moment(date).format(ISO_MONTH);
    case 'month-date':
      return moment(date).startOf('month').toDate();
    case 'iso-date-utc':
      // Idéntico a `new Date('YYYY-MM-DD')`: medianoche UTC del día elegido.
      return new Date(moment(date).format(ISO_DATE));
  }
}
