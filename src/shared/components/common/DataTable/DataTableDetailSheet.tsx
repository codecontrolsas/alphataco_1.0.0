'use client';

import { flexRender, type Row } from '@tanstack/react-table';

import { ResponsiveDialog } from '@/components/ui/responsive-dialog';

import type { DataTableDetailSheetProps, MobileColumnEntry, MobileLayout } from './types';

/**
 * Detalle de una fila en modo mobile (ver docs/rediseno-ui/features/fase-3-datatable.md §3.5.3).
 * Este archivo también exporta las piezas que comparte la tarjeta cuando el detalle va en línea.
 */

/** Renderiza la celda de una columna para una fila, reusando el `cell` del consumidor. */
export function renderRowCell<TData>(row: Row<TData>, columnId: string): React.ReactNode {
  const cell = row.getVisibleCells().find((c) => c.column.id === columnId);
  return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
}

/** Texto plano del título de la fila (nombre accesible de la tarjeta y del detalle). */
export function getRowTitleText<TData>(row: Row<TData>, layout: MobileLayout<TData>): string {
  const parts = layout.titles
    .map((entry) => row.getValue(entry.column.id))
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));
  return parts.length > 0 ? parts.join(' ') : 'Registro';
}

interface DataTableDetailBodyProps<TData> {
  row: Row<TData>;
  layout: MobileLayout<TData>;
  /** Muestra también título y estado arriba (el sheet); en línea ya están en la tarjeta. */
  showHeading?: boolean;
}

/** `<dl>` de 1 columna con todas las columnas visibles no estructurales, en el orden de la tabla. */
export function DataTableDetailBody<TData>({ row, layout, showHeading = false }: DataTableDetailBodyProps<TData>) {
  const order = new Map(row.getVisibleCells().map((cell, index) => [cell.column.id, index]));
  const entries: MobileColumnEntry<TData>[] = [
    ...(layout.subtitle ? [layout.subtitle] : []),
    ...layout.fields,
    ...layout.detailOnly,
  ].sort((a, b) => (order.get(a.column.id) ?? 0) - (order.get(b.column.id) ?? 0));

  return (
    <div className="flex flex-col gap-4">
      {showHeading ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {layout.titles.map((entry) => (
            <div key={entry.column.id} className="text-body min-w-0 font-medium break-words">
              {renderRowCell(row, entry.column.id)}
            </div>
          ))}
          {layout.status ? <div className="shrink-0">{renderRowCell(row, layout.status.column.id)}</div> : null}
        </div>
      ) : null}
      <dl className="flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.column.id} className="min-w-0">
            <dt className="text-caption text-muted-foreground">{entry.label}</dt>
            <dd className="text-cell min-w-0 break-words">{renderRowCell(row, entry.column.id)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Acciones de la fila (celda `actions` del consumidor, tal cual). */
export function DataTableDetailActions<TData>({ row, layout }: { row: Row<TData>; layout: MobileLayout<TData> }) {
  if (!layout.actions) return null;
  return <>{renderRowCell(row, layout.actions.id)}</>;
}

export function DataTableDetailSheet<TData>({
  table,
  layout,
  rowId,
  onOpenChange,
  inline = false,
}: DataTableDetailSheetProps<TData>) {
  // Dentro de un dialog el detalle se expande en la tarjeta: acá no se monta ningún overlay.
  if (inline) return null;

  const row = rowId === null ? undefined : table.getRowModel().rowsById[rowId];
  // La fila se deriva: si desaparece (borrada o fuera del filtro) el sheet se cierra solo.
  const open = row !== undefined;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={row ? getRowTitleText(row, layout) : 'Detalle'}
      layout="sheet"
      size="md"
      footer={
        row && layout.actions ? (
          <div className="flex flex-wrap items-center gap-2">
            <DataTableDetailActions row={row} layout={layout} />
          </div>
        ) : undefined
      }
    >
      {row ? (
        <div data-testid="table-detail-sheet">
          <DataTableDetailBody row={row} layout={layout} showHeading />
        </div>
      ) : null}
    </ResponsiveDialog>
  );
}
