import type { Column } from '@tanstack/react-table';

import type { DataTableColumnMobileMeta, MobileColumnEntry, MobileLayout } from './types';

/**
 * Resolución de roles del modo mobile (sin React, sin directiva: importable desde cualquier lado).
 * Decide qué columna va como título, subtítulo, estado o campo de la tarjeta, y cuáles solo al detalle.
 * Ver docs/rediseno-ui/features/fase-3-datatable.md §3.1.
 */

const MAX_TITLES = 2;
const MAX_FIELDS = 3;
const STATUS_IDS = new Set(['status', 'state', 'estado']);

/** Texto que nombra una columna: único lugar que decide el label (menú de columnas, tarjeta, detalle). */
export function getColumnLabel<TData>(column: Column<TData, unknown>): string {
  const { header, meta } = column.columnDef;
  return meta?.mobile?.label ?? meta?.title ?? (typeof header === 'string' && header ? header : column.id);
}

/**
 * Texto de la columna en las superficies de desktop (menú de columnas, chip de orden): `meta.title` primero, como
 * antes de la Fase 3. `mobile.label` es solo para la tarjeta y el detalle (plan §3.1): un label corto ("Baja",
 * "Km") no reemplaza al título en desktop. Sin `meta.title`, cae a `getColumnLabel`.
 */
export function getColumnTitle<TData>(column: Column<TData, unknown>): string {
  return column.columnDef.meta?.title || getColumnLabel(column);
}

function isSelectColumn<TData>(column: Column<TData, unknown>): boolean {
  return column.id === 'select';
}

function isActionsColumn<TData>(column: Column<TData, unknown>): boolean {
  return column.id === 'actions';
}

/** Columna de UI sin dato propio (imagen, íconos): no sirve de título ni de campo, va al detalle. */
function isDisplayOnlyColumn<TData>(column: Column<TData, unknown>): boolean {
  return !column.accessorFn && Boolean(column.columnDef.meta?.excludeFromExport);
}

function toEntry<TData>(column: Column<TData, unknown>): MobileColumnEntry<TData> {
  return {
    column,
    label: getColumnLabel(column),
    hideLabel: column.columnDef.meta?.mobile?.hideLabel === true,
  };
}

interface Candidate<TData> {
  column: Column<TData, unknown>;
  index: number;
  mobile: DataTableColumnMobileMeta | undefined;
}

/** Orden por `priority` (menor primero); sin prioridad, el orden de la columna en la tabla. */
function byPriority<TData>(a: Candidate<TData>, b: Candidate<TData>): number {
  return (a.mobile?.priority ?? a.index) - (b.mobile?.priority ?? b.index) || a.index - b.index;
}

/**
 * Resuelve el layout mobile a partir de las columnas VISIBLES, en el orden actual de la tabla.
 * - Tabla anotada (alguna columna con `meta.mobile`): se respetan los roles; lo no anotado va al detalle.
 * - Tabla sin anotar: heurística. Título = primera columna, estado = primera con id status/state/estado,
 *   campos = las 3 siguientes; el resto, al detalle.
 */
export function resolveMobileLayout<TData>(visibleColumns: ReadonlyArray<Column<TData, unknown>>): MobileLayout<TData> {
  let select: Column<TData, unknown> | null = null;
  let actions: Column<TData, unknown> | null = null;
  const candidates: Candidate<TData>[] = [];
  const displayOnly: Column<TData, unknown>[] = [];

  for (const [index, column] of visibleColumns.entries()) {
    if (isSelectColumn(column)) {
      select = column;
    } else if (isActionsColumn(column)) {
      actions = column;
    } else if (isDisplayOnlyColumn(column)) {
      displayOnly.push(column);
    } else {
      candidates.push({ column, index, mobile: column.columnDef.meta?.mobile });
    }
  }

  const annotated = candidates.some((c) => c.mobile !== undefined);

  const titles: Candidate<TData>[] = [];
  const fields: Candidate<TData>[] = [];
  const detailOnly: Candidate<TData>[] = [];
  let subtitle: Candidate<TData> | null = null;
  let status: Candidate<TData> | null = null;

  if (annotated) {
    for (const candidate of [...candidates].sort(byPriority)) {
      switch (candidate.mobile?.role) {
        case 'title':
          (titles.length < MAX_TITLES ? titles : fields).push(candidate);
          break;
        case 'subtitle':
          if (subtitle === null) subtitle = candidate;
          else fields.push(candidate);
          break;
        case 'status':
          if (status === null) status = candidate;
          else fields.push(candidate);
          break;
        case 'field':
          fields.push(candidate);
          break;
        default:
          detailOnly.push(candidate);
      }
    }
    // Si el usuario ocultó la(s) columna(s) título, asciende el primer campo para no quedar sin título.
    if (titles.length === 0) {
      const promoted = fields.shift();
      if (promoted) titles.push(promoted);
    }
  } else {
    const [first, ...rest] = candidates;
    if (first) titles.push(first);
    status = rest.find((c) => STATUS_IDS.has(c.column.id.toLowerCase())) ?? null;
    const remaining = rest.filter((c) => c !== status);
    fields.push(...remaining.slice(0, MAX_FIELDS));
    detailOnly.push(...remaining.slice(MAX_FIELDS));
  }

  // Los campos que superan el máximo visible se ven solo en el detalle.
  const visibleFields = fields.slice(0, MAX_FIELDS);
  const overflowFields = fields.slice(MAX_FIELDS);

  return {
    titles: titles.map((c) => toEntry(c.column)),
    subtitle: subtitle ? toEntry(subtitle.column) : null,
    status: status ? toEntry(status.column) : null,
    fields: visibleFields.map((c) => toEntry(c.column)),
    detailOnly: [...overflowFields.map((c) => c.column), ...detailOnly.map((c) => c.column), ...displayOnly].map(toEntry),
    select,
    actions,
  };
}
