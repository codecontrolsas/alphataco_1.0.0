import { argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';

/** Prefijo de los filtros en la URL: el Dashboard y otras pantallas enlazan a `?subtab=old&diagOld_*=...`. */
export const URL_NAMESPACE = 'diagOld_';

/** Máximo de días de la ventana (el servidor rechaza más). */
export const MAX_RANGE_DAYS = 366;
/** Ventana inicial: hoy y los 30 días siguientes (31 columnas, igual que la vista anterior). */
const DEFAULT_RANGE_DAYS = 30;
/** Valor del filtro de novedad para "sin novedad cargada hoy". */
export const NONE_VALUE = '__none__';

const MAX_SEARCH_LENGTH = 100;
const DATE_FORMAT = 'YYYY-MM-DD';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtros de lista (varios valores), con el mismo nombre de clave que ya usaban los enlaces `diagOld_*`. */
export const ARRAY_FILTER_KEYS = [
  'position',
  'workflow',
  'costCenter',
  'covenant',
  'guild',
  'category',
  'contractor',
  'diagramType',
] as const;

export type ArrayFilterKey = (typeof ARRAY_FILTER_KEYS)[number];

export type DiagramCalendarFilters = {
  /** Texto libre: nombre, apellido o legajo. */
  search: string;
  /** Primer y último día de la grilla (`YYYY-MM-DD`). */
  from: string;
  to: string;
} & Record<ArrayFilterKey, string[]>;

type ParamsReader = { get: (name: string) => string | null };

/** Rango inicial en hora argentina. */
export function getDefaultRange() {
  const from = argentinaDate();
  return { from, to: moment.utc(from, DATE_FORMAT).add(DEFAULT_RANGE_DAYS, 'days').format(DATE_FORMAT) };
}

/** Deja un rango válido: `to` nunca antes que `from` y a lo sumo `MAX_RANGE_DAYS` días. */
export function clampRange(from: string, to: string) {
  const start = moment.utc(from, DATE_FORMAT);
  const end = moment.utc(to, DATE_FORMAT);
  if (end.isBefore(start)) return { from, to: from };
  if (end.diff(start, 'days') + 1 > MAX_RANGE_DAYS) {
    return {
      from,
      to: start
        .clone()
        .add(MAX_RANGE_DAYS - 1, 'days')
        .format(DATE_FORMAT),
    };
  }
  return { from, to };
}

export function countRangeDays(from: string, to: string) {
  return moment.utc(to, DATE_FORMAT).diff(moment.utc(from, DATE_FORMAT), 'days') + 1;
}

function readDate(value: string | null): string | null {
  return value && moment.utc(value, DATE_FORMAT, true).isValid() ? value : null;
}

function readList(value: string | null, allowNone: boolean): string[] {
  if (!value) return [];
  return value.split(',').filter((id) => UUID_PATTERN.test(id) || (allowNone && id === NONE_VALUE));
}

/**
 * Filtros a partir de la URL. Se aceptan los parámetros de siempre (`diagOld_position`, `diagOld_diagramType`...):
 * los `diagOld_firstname`/`diagOld_lastname` viejos se juntan en el buscador de texto cuando no hay `diagOld_q`.
 * Todo valor inválido (fecha mal escrita, id que no es uuid) se descarta para no dar error en el servidor.
 */
export function parseFilters(params: ParamsReader): DiagramCalendarFilters {
  const defaults = getDefaultRange();
  const legacyName = [params.get(`${URL_NAMESPACE}firstname`), params.get(`${URL_NAMESPACE}lastname`)]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  const range = clampRange(
    readDate(params.get(`${URL_NAMESPACE}from`)) ?? defaults.from,
    readDate(params.get(`${URL_NAMESPACE}to`)) ?? defaults.to
  );

  return {
    search: (params.get(`${URL_NAMESPACE}q`) ?? legacyName).trim().slice(0, MAX_SEARCH_LENGTH),
    ...range,
    position: readList(params.get(`${URL_NAMESPACE}position`), false),
    workflow: readList(params.get(`${URL_NAMESPACE}workflow`), false),
    costCenter: readList(params.get(`${URL_NAMESPACE}costCenter`), false),
    covenant: readList(params.get(`${URL_NAMESPACE}covenant`), false),
    guild: readList(params.get(`${URL_NAMESPACE}guild`), false),
    category: readList(params.get(`${URL_NAMESPACE}category`), false),
    contractor: readList(params.get(`${URL_NAMESPACE}contractor`), false),
    diagramType: readList(params.get(`${URL_NAMESPACE}diagramType`), true),
  };
}

/** Query string con los filtros actuales; conserva los parámetros ajenos (`tab`, `subtab`...). */
export function buildSearch(filters: DiagramCalendarFilters, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of [...params.keys()]) {
    if (key.startsWith(URL_NAMESPACE)) params.delete(key);
  }

  if (filters.search) params.set(`${URL_NAMESPACE}q`, filters.search);
  for (const key of ARRAY_FILTER_KEYS) {
    if (filters[key].length > 0) params.set(`${URL_NAMESPACE}${key}`, filters[key].join(','));
  }
  const defaults = getDefaultRange();
  if (filters.from !== defaults.from || filters.to !== defaults.to) {
    params.set(`${URL_NAMESPACE}from`, filters.from);
    params.set(`${URL_NAMESPACE}to`, filters.to);
  }

  return params.toString();
}

export function countActiveListFilters(filters: DiagramCalendarFilters): number {
  return ARRAY_FILTER_KEYS.filter((key) => filters[key].length > 0).length;
}

export function hasActiveFilters(filters: DiagramCalendarFilters): boolean {
  return filters.search.length > 0 || countActiveListFilters(filters) > 0;
}

// ── Días de la grilla ─────────────────────────────────────────────────────────

const WEEKDAY_LETTER = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const;
const WEEKDAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

export type CalendarDay = {
  /** `YYYY-MM-DD`. */
  key: string;
  letter: string;
  /** `dd/MM`. */
  label: string;
  /** Texto accesible: "lunes 12/10/2026". */
  fullLabel: string;
  isWeekend: boolean;
  isToday: boolean;
};

export function listCalendarDays(from: string, to: string, today: string): CalendarDay[] {
  const days: CalendarDay[] = [];
  const cursor = moment.utc(from, DATE_FORMAT);
  const end = moment.utc(to, DATE_FORMAT);
  while (cursor.isSameOrBefore(end, 'day')) {
    const weekday = cursor.day();
    const key = cursor.format(DATE_FORMAT);
    days.push({
      key,
      letter: WEEKDAY_LETTER[weekday],
      label: cursor.format('DD/MM'),
      fullLabel: `${WEEKDAY_NAME[weekday]} ${cursor.format('DD/MM/YYYY')}`,
      isWeekend: weekday === 0 || weekday === 6,
      isToday: key === today,
    });
    cursor.add(1, 'day');
  }
  return days;
}

/** "lunes 12/10/2026" para un `YYYY-MM-DD`. */
export function formatDayLong(dayKey: string): string {
  const day = moment.utc(dayKey, DATE_FORMAT);
  return `${WEEKDAY_NAME[day.day()]} ${day.format('DD/MM/YYYY')}`;
}

// ── Empleados ─────────────────────────────────────────────────────────────────

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** `Apellido, Nombre`. */
export function formatEmployeeName(employee: { lastname: string; firstname: string }): string {
  return `${capitalize(employee.lastname)}, ${capitalize(employee.firstname)}`;
}

/** `[legajo] Apellido, Nombre` (regla de legajo en toda superficie con empleados). */
export function formatEmployeeLabel(employee: { file: string; lastname: string; firstname: string }): string {
  return `[${employee.file}] ${formatEmployeeName(employee)}`;
}
