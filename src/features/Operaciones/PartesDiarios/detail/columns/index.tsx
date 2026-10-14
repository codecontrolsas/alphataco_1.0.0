'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { DailyReportDetailRow } from '../types';
import { getEmployeeColumns } from './employee-columns';
import { getLineColumns } from './line-columns';
import { getResourceColumns } from './resource-columns';
import { getActionsColumn, getStatusColumns } from './status-columns';
import type { DeviationGetters, Permissions, RowActionHandlers } from './types';

export type { DeviationGetters, Permissions, RowActionHandlers } from './types';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
//
// Las columnas atómicas NO se borran: la toolbar resuelve los filtros con
// `table.getColumn(filter.columnId)` y el export recorre todas las ColumnDef. Quedan ocultas
// y las reemplazan las compuestas (`line_*`), que son solo de presentación.
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'customer',
  'service',
  'item',
  'sector',
  'area',
  'type_service',
  'customer_equipment',
  'chofer_dia',
  'ayudante_dia',
  'chofer_noche',
  'ayudante_noche',
  'employees',
  'equipment',
  'working_day',
  'start_time',
  'end_time',
  'description',
  'remit_number',
  'completed_day',
  'completed_night',
];

// ============================================================================
// COLUMNS DEFINITION
//
// - line-columns.tsx: compuestas visibles (servicio, dónde y cuándo, recursos, remito)
// - resource-columns.tsx: selección + identidad del servicio + equipo del cliente
// - employee-columns.tsx: roles de empleados + empleados + equipos asignados
// - status-columns.tsx: jornada/horarios/estado/descripción/remito/completados + acciones
// - badge-cells.tsx: celdas con badge + tooltip de desviaciones (columnas atómicas)
// - row-actions-cell.tsx: menú ⋯ de la columna "actions"
// - helpers.ts / types.ts
//
// Orden: select → compuestas → estado → remito → actions → atómicas ocultas.
// ============================================================================

function columnKey(column: ColumnDef<DailyReportDetailRow>): string {
  if (column.id) return column.id;
  return 'accessorKey' in column ? String(column.accessorKey) : '';
}

export function getColumns(
  permissions: Permissions,
  handlers: RowActionHandlers,
  reportDate: string,
  deviations: DeviationGetters
): ColumnDef<DailyReportDetailRow>[] {
  const atomic = [...getResourceColumns(), ...getEmployeeColumns(deviations), ...getStatusColumns()];
  const select = atomic.find((column) => columnKey(column) === 'select');
  const status = atomic.find((column) => columnKey(column) === 'status');
  const hidden = atomic.filter((column) => !['select', 'status'].includes(columnKey(column)));

  const line = getLineColumns(permissions, handlers, reportDate, deviations);
  const remit = line.find((column) => column.id === 'line_remit');
  const composite = line.filter((column) => column.id !== 'line_remit');

  return [
    ...(select ? [select] : []),
    ...composite,
    ...(status ? [status] : []),
    ...(remit ? [remit] : []),
    getActionsColumn(permissions, handlers, reportDate),
    ...hidden,
  ];
}
