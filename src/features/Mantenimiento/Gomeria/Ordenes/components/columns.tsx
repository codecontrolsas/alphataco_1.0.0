'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RowActionsMenu, type RowAction } from '@/features/Mantenimiento/Gomeria/shared/RowActionsMenu';
import { TireServiceOrderStatusPill } from '@/features/Mantenimiento/Gomeria/shared/TireStatusPills';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CircleOff, Eye, Lock, Play } from 'lucide-react';
import type { ServiceOrderListItem } from '../actions/service-order-list.server';

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

/** Columnas que arrancan ocultas en el diseño nuevo (`-v2`); las preferencias guardadas ganan sobre esta lista. */
export const SERVICE_ORDER_HIDDEN_COLUMNS_BY_DEFAULT: Record<string, boolean> = {
  created_at: false,
};

/** "U-133 · Tractocamión 6x4": número interno y subtipo debajo del dominio. */
function vehicleSubtitle(vehicle: { intern_number: string | null; sub_type: { name: string } | null } | null) {
  if (!vehicle) return null;
  return [vehicle.intern_number, vehicle.sub_type?.name].filter(Boolean).join(' · ') || null;
}

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: Permissions,
  onClose: (order: ServiceOrderListItem) => void,
  onCancel: (order: ServiceOrderListItem) => void,
  onViewDetail?: (order: ServiceOrderListItem) => void,
  onContinue?: (order: ServiceOrderListItem) => void
): ColumnDef<ServiceOrderListItem>[] {
  const canUpdate = permissions.hasPermission('mantenimiento', 'ordenes_gomeria', 'update');
  const canDelete = permissions.hasPermission('mantenimiento', 'ordenes_gomeria', 'delete');

  return [
    // --- Select ---
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todo"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { excludeFromExport: true, title: '' },
    },

    // --- Vehicle (compuesta: dominio + interno y subtipo; abre el detalle) ---
    {
      id: 'vehicle_id',
      accessorFn: (row) => row.vehicle?.domain ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vehículo" />,
      cell: ({ row }) => {
        const vehicle = row.original.vehicle;
        if (!vehicle?.domain) return <div className="text-muted-foreground">-</div>;
        const subtitle = vehicleSubtitle(vehicle);
        const content = (
          <span className="flex flex-col items-start gap-0.5">
            <span className="font-mono text-sm font-semibold">{vehicle.domain}</span>
            {subtitle ? <span className="text-muted-foreground text-xs">{subtitle}</span> : null}
          </span>
        );
        if (!onViewDetail) return content;
        return (
          <button
            type="button"
            onClick={() => onViewDetail(row.original)}
            aria-label={`Ver detalle de la orden de ${vehicle.domain}`}
            className="focus-visible:ring-ring/50 rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px]"
          >
            {content}
          </button>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.vehicle_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Vehículo' },
    },

    // --- Service Date ---
    {
      id: 'service_date',
      accessorKey: 'service_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => (
        <div className="font-mono text-sm tabular-nums">
          {row.original.service_date ? formatArgentinaDateTime(row.original.service_date) : '-'}
        </div>
      ),
      meta: { title: 'Fecha' },
    },

    // --- Status ---
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <TireServiceOrderStatusPill status={row.original.status} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Estado' },
    },

    // --- Trailer ---
    {
      id: 'trailer_vehicle_id',
      accessorFn: (row) => row.trailer?.domain ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Enganche" />,
      cell: ({ row }) => {
        const trailer = row.original.trailer;
        if (!trailer?.domain)
          return (
            <div className="text-muted-foreground inline-flex items-center gap-1">
              <CircleOff className="h-3 w-3" aria-hidden="true" />
              Sin asignar
            </div>
          );
        const subtitle = vehicleSubtitle(trailer);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm font-semibold">{trailer.domain}</span>
            {subtitle ? <span className="text-muted-foreground text-xs">{subtitle}</span> : null}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.trailer_vehicle_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Enganche' },
    },

    // --- Kilometer ---
    {
      id: 'kilometer',
      accessorKey: 'kilometer',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kilómetros" />,
      cell: ({ row }) => {
        const km = row.original.kilometer;
        if (!km) return <div className="text-muted-foreground">-</div>;
        return <div className="font-mono text-sm tabular-nums">{km}</div>;
      },
      meta: { title: 'Kilómetros' },
    },

    // --- Interventions (virtual) ---
    {
      id: 'interventions',
      accessorFn: (row) => row._count?.items ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Intervenciones" />,
      cell: ({ row }) => {
        const count = row.original._count?.items ?? 0;
        return <Badge variant={count > 0 ? 'default' : 'outline'}>{count}</Badge>;
      },
      enableSorting: false,
      meta: { title: 'Intervenciones' },
    },

    // --- Created By ---
    {
      id: 'created_by',
      accessorFn: (row) => row.creator?.fullname ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado por" />,
      cell: ({ row }) => {
        const name = row.original.creator?.fullname;
        return <div>{name ?? <span className="text-muted-foreground">-</span>}</div>;
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.created_by;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Creado por' },
    },

    // --- Created At (atómica, oculta por defecto) ---
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => (
        <div className="font-mono text-sm tabular-nums">
          {row.original.created_at ? formatArgentinaDateTime(row.original.created_at) : '-'}
        </div>
      ),
      meta: { title: 'Creado' },
    },

    // --- Actions: menú ⋯ (ver = view; continuar/finalizar = update; anular = delete, solo en abiertas) ---
    {
      id: 'actions',
      cell: ({ row }: { row: import('@tanstack/react-table').Row<ServiceOrderListItem> }) => {
        const order = row.original;
        const isOpen = order.status === 'OPEN';
        const actions: RowAction[] = [];
        if (onViewDetail)
          actions.push({ key: 'detail', label: 'Ver detalle', icon: Eye, onSelect: () => onViewDetail(order) });
        if (isOpen && canUpdate && onContinue) {
          actions.push({
            key: 'continue',
            label: 'Continuar intervenciones',
            icon: Play,
            onSelect: () => onContinue(order),
          });
        }
        if (isOpen && canUpdate)
          actions.push({ key: 'close', label: 'Finalizar orden', icon: Lock, onSelect: () => onClose(order) });
        if (isOpen && canDelete) {
          actions.push({
            key: 'cancel',
            label: 'Anular orden',
            icon: Ban,
            destructive: true,
            onSelect: () => onCancel(order),
          });
        }
        return (
          <RowActionsMenu label={`Acciones de la orden de ${order.vehicle?.domain ?? 'gomería'}`} actions={actions} />
        );
      },
      enableSorting: false,
      enableHiding: false,
      meta: { title: '', excludeFromExport: true },
    } satisfies ColumnDef<ServiceOrderListItem>,
  ];
}
