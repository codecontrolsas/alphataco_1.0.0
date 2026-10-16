import moment from 'moment';

/**
 * Enlaces a las listas de documentos permanentes con el filtro de vencimiento aplicado.
 * Los parámetros de cada tabla van con el prefijo `<tableId>__` (ver `stripPrefixFromSearchParams`) y el
 * rango de fechas de la columna `validity` usa `validity_from` / `validity_to` (`YYYY-MM-DD`).
 */

export type DocumentResourceKind = 'employees' | 'vehicles';

const LIST_BY_KIND = {
  employees: {
    path: '/dashboard/document',
    tab: 'documentos-de-empleados',
    subtab: 'empleados-permanentes',
    tableId: 'employee-permanent-docs',
  },
  vehicles: {
    path: '/dashboard/document',
    tab: 'documentos-de-equipos',
    subtab: 'equipos-permanentes',
    tableId: 'equipment-permanent-docs',
  },
} as const satisfies Record<DocumentResourceKind, { path: string; tab: string; subtab: string; tableId: string }>;

/** Lista de permanentes con vencimiento entre `from` y `to` (alguno puede omitirse). */
export function expiringListHref(kind: DocumentResourceKind, range: { from?: string; to?: string }): string {
  const list = LIST_BY_KIND[kind];
  const params = new URLSearchParams({ tab: list.tab, subtab: list.subtab, [`${list.tableId}__sort`]: 'validity.asc' });
  if (range.from) params.set(`${list.tableId}__validity_from`, range.from);
  if (range.to) params.set(`${list.tableId}__validity_to`, range.to);
  return `${list.path}?${params.toString()}`;
}

/** Documentos ya vencidos: todo lo que vence hasta ayer. */
export function overdueListHref(kind: DocumentResourceKind, today: string): string {
  return expiringListHref(kind, { to: moment.utc(today).subtract(1, 'day').format('YYYY-MM-DD') });
}

/** Día `daysLeft` contando desde `today` (`YYYY-MM-DD`). */
export function dayFromToday(today: string, daysLeft: number): string {
  return moment.utc(today).add(daysLeft, 'days').format('YYYY-MM-DD');
}

/** Lista de personas o equipos activos filtrada por estado documental (los valores del enum de Prisma). */
export function statusListHref(kind: DocumentResourceKind, status: string): string {
  return kind === 'employees'
    ? `/dashboard/employee?tab=employees&subtab=empleados-activos&employees-active__status=${status}`
    : `/dashboard/equipment?tab=vehicles&vehicles__status=${status}`;
}
