'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DeliveryRowActions, formatEmployeeLabel } from '@/features/Clothing/components/DeliveryRowActions';
import { DeliveryStatusBadge } from '@/features/Clothing/components/DeliveryStatusBadge';
import { DELIVERY_STATUS_ACTIVE, DELIVERY_STATUS_CANCELLED } from '@/features/Clothing/lib/delivery-stock-where';
import { clothingDeliveryTypeBadges, clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import { formatMoney } from '@/features/Warehouses/lib/format';
import type { clothing_delivery_type } from '@/generated/prisma/enums';
import {
  matchesColumnValue,
  matchesNullableColumnValue,
  matchesNullableId,
  titled,
} from '@/shared/components/common/DataTable/column-helpers';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import moment from 'moment';

/**
 * Columnas que repiten las tablas de entregas de ropa (historial del empleado, todas las entregas y
 * reporte global). Cada tabla las ubica en su orden: el `id` de la columna lo leen los filtros, la
 * visibilidad inicial y la exportación, así que no cambia entre tablas.
 */

/** Opciones de las columnas de las tablas con anulación y costo (historial del empleado y reportes). */
export interface DeliveryColumnsOptions {
  /** `almacenes:movimientos:view_prices`: sin permiso la columna Costo no existe. */
  canViewPrices: boolean;
  /** `empleados:indumentaria_empleado:delete`: habilita la accion Anular. */
  canCancel: boolean;
  /** Key de la query de la tabla, para refrescarla al anular. */
  queryKey: readonly unknown[];
}

type Person = { id: string; firstname: string; lastname: string; file: string };
type DeliveredByRow = { employees_clothing_deliveries_delivered_by_idToemployees: Person | null };
type RecipientRow = { employees_clothing_deliveries_employee_idToemployees: Person | null };

const dash = <span className="text-muted-foreground">-</span>;

export function selectColumn<T>(): ColumnDef<T> {
  return {
    id: 'select',
    meta: { excludeFromExport: true, title: '' },
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Seleccionar todas las visibles"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleccionar entrega"
        onClick={(e) => e.stopPropagation()}
      />
    ),
  };
}

export function deliveredAtColumn<T extends { delivered_at: Date | string | null }>(): ColumnDef<T> {
  return {
    accessorKey: 'delivered_at',
    id: 'delivered_at',
    ...titled('Fecha de entrega'),
    cell: ({ row }) => (row.original.delivered_at ? moment(row.original.delivered_at).format('DD/MM/YYYY') : '-'),
  };
}

export function deliveryTypeColumn<T extends { delivery_type: clothing_delivery_type | null }>(): ColumnDef<T> {
  return {
    accessorKey: 'delivery_type',
    id: 'delivery_type',
    ...titled('Tipo de entrega'),
    cell: ({ row }) => {
      const type = row.original.delivery_type;
      if (!type) return dash;
      return <Badge variant={clothingDeliveryTypeBadges[type]}>{clothingDeliveryTypeLabels[type]}</Badge>;
    },
    filterFn: matchesNullableColumnValue,
  };
}

/** Estado (columna virtual derivada de `cancelled_at`). */
export function deliveryStatusColumn<
  T extends { cancelled_at: Date | string | null; cancel_reason: string | null },
>(): ColumnDef<T> {
  return {
    id: 'status',
    accessorFn: (row) => (row.cancelled_at ? DELIVERY_STATUS_CANCELLED : DELIVERY_STATUS_ACTIVE),
    ...titled('Estado'),
    cell: ({ row }) => (
      <DeliveryStatusBadge cancelledAt={row.original.cancelled_at} cancelReason={row.original.cancel_reason} />
    ),
    filterFn: matchesColumnValue,
  };
}

/** Legajo de una persona de la entrega. `headerTitle` es lo que se lee en la tabla; `metaTitle`, en el selector de columnas. */
export function personFileColumn<T>(
  id: string,
  getPerson: (row: T) => Person | null,
  metaTitle: string,
  headerTitle: string
): ColumnDef<T> {
  return {
    id,
    accessorFn: (row) => getPerson(row)?.file ?? '',
    meta: { title: metaTitle },
    header: ({ column }) => <DataTableColumnHeader column={column} title={headerTitle} />,
    cell: ({ row }) => <span className="font-mono text-xs">{getPerson(row.original)?.file ?? '-'}</span>,
  };
}

/** Legajo de quien entregó (el encabezado es siempre "Legajo (entregó)"). */
export function deliveredByFileColumn<T extends DeliveredByRow>(metaTitle: string): ColumnDef<T> {
  return personFileColumn<T>(
    'delivered_by_file',
    (row) => row.employees_clothing_deliveries_delivered_by_idToemployees,
    metaTitle,
    'Legajo (entregó)'
  );
}

/** Apellido y nombre de una persona de la entrega, o un guion. */
function PersonName({ person }: { person: Person | null }) {
  if (!person) return dash;
  return (
    <span>
      {person.lastname ?? ''} {person.firstname ?? ''}
    </span>
  );
}

/** Persona de la entrega (destinatario o quien entregó): el valor de la columna es su id y el filtro admite "Sin asignar". */
export function personIdColumn<T>(id: string, title: string, getPerson: (row: T) => Person | null): ColumnDef<T> {
  return {
    id,
    accessorFn: (row) => getPerson(row)?.id ?? null,
    ...titled(title),
    cell: ({ row }) => <PersonName person={getPerson(row.original)} />,
    filterFn: matchesNullableId<T>((row) => getPerson(row)?.id ?? null),
  };
}

/** Quien entregó (`delivered_by_id`). */
export function deliveredByIdColumn<T extends DeliveredByRow>(): ColumnDef<T> {
  return personIdColumn<T>(
    'delivered_by_id',
    'Entregado por',
    (row) => row.employees_clothing_deliveries_delivered_by_idToemployees
  );
}

type ItemsRow = {
  clothing_delivery_items: Array<{
    quantity: number;
    clothing_items: { name: string } | null;
    clothing_brands: { name: string } | null;
    clothing_sizes: { name: string } | null;
  }>;
};

/** Artículos de la entrega: el primero en la celda y todos en el tooltip. */
export function itemsDetailColumn<T extends ItemsRow>(): ColumnDef<T> {
  return {
    id: 'items_detail',
    accessorFn: () => null,
    ...titled('Artículos'),
    enableSorting: false,
    cell: ({ row }) => {
      const items = row.original.clothing_delivery_items ?? [];
      if (items.length === 0) {
        return <span className="text-muted-foreground">Sin artículos</span>;
      }

      const itemLabels = items.map((item) => {
        const name = item.clothing_items?.name ?? 'Artículo';
        const brand = item.clothing_brands?.name;
        const size = item.clothing_sizes?.name;
        const qty = item.quantity;
        const detail = [brand, size].filter(Boolean).join(', ');
        return `${name}${detail ? ` (${detail})` : ''} x${qty}`;
      });

      const firstLabel = itemLabels[0];
      const hasMore = itemLabels.length > 1;

      return (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex cursor-default">
                <span className="text-sm">
                  {firstLabel}
                  {hasMore && <span className="ml-1 text-muted-foreground">+{itemLabels.length - 1} más</span>}
                </span>
              </div>
            </TooltipTrigger>
            {hasMore && (
              <TooltipContent className="rounded-lg bg-black p-2 text-white">
                <div className="flex flex-col gap-1">
                  {itemLabels.map((label, idx) => (
                    <span key={idx} className="text-sm">
                      {label}
                    </span>
                  ))}
                </div>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      );
    },
  };
}

/** Depósito del que salió la entrega (FK nullable: las anteriores a Almacenes no tienen). */
export function warehouseColumn<T extends { warehouse: { id: string; name: string } | null }>(): ColumnDef<T> {
  return {
    id: 'warehouse',
    accessorFn: (row) => row.warehouse?.name ?? '',
    ...titled('Depósito'),
    cell: ({ row }) => row.original.warehouse?.name ?? <span className="text-muted-foreground">—</span>,
    filterFn: matchesNullableId<T>((row) => row.warehouse?.id),
  };
}

/** Costo de la salida de stock. Sin `view_prices` la columna no existe (devuelve una lista vacía para esparcir). */
export function costColumns<T extends { cost: string | null }>(canViewPrices: boolean): ColumnDef<T>[] {
  if (!canViewPrices) return [];
  return [
    {
      id: 'cost',
      accessorFn: (row) => row.cost,
      ...titled('Costo'),
      cell: ({ row }) =>
        row.original.cost != null ? (
          <span className="tabular-nums">{formatMoney(row.original.cost)}</span>
        ) : (
          <span className="text-muted-foreground">Sin costo</span>
        ),
    },
  ];
}

/** Firma, como ícono (con / sin firma). */
export function signatureIconColumn<T extends { signature_url: string | null }>(): ColumnDef<T> {
  return {
    id: 'has_signature',
    accessorFn: (row) => (row.signature_url != null ? 'true' : 'false'),
    ...titled('Firma'),
    cell: ({ row }) =>
      row.original.signature_url ? (
        <Check className="h-4 w-4 text-green-600" aria-label="Con firma" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground" aria-label="Sin firma" />
      ),
    filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id))),
  };
}

/** Notas (suele ir oculta por defecto). */
export function notesColumn<T extends { notes: string | null }>(className = 'text-muted-foreground'): ColumnDef<T> {
  return {
    accessorKey: 'notes',
    id: 'notes',
    ...titled('Notas'),
    cell: ({ row }) => <span className={className}>{row.original.notes ?? '-'}</span>,
  };
}

/** Acciones de fila: constancia PDF y anular. */
export function deliveryActionsColumn<
  T extends RecipientRow & { id: string; cancelled_at: Date | string | null; warehouse_id: string | null },
>({ canCancel, queryKey }: Pick<DeliveryColumnsOptions, 'canCancel' | 'queryKey'>): ColumnDef<T> {
  return {
    id: 'actions',
    meta: { excludeFromExport: true, title: '' },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <DeliveryRowActions
        deliveryId={row.original.id}
        employeeLabel={formatEmployeeLabel(row.original.employees_clothing_deliveries_employee_idToemployees)}
        canCancel={canCancel}
        isCancelled={row.original.cancelled_at != null}
        hasStock={row.original.warehouse_id != null}
        queryKey={queryKey}
      />
    ),
  };
}
