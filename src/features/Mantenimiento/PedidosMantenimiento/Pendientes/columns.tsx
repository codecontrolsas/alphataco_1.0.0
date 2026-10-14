'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PreventiveItemsBadge } from '@/features/Mantenimiento/components/PreventiveItemsBadge';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { type ColumnDef } from '@tanstack/react-table';
import { Calendar, ClipboardList, Clock, Eye, History, HourglassIcon, Shield, Wrench, XCircle } from 'lucide-react';
import moment from 'moment';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { getResourceInternNumber, getResourceKindLabel, getResourceLabel } from '../../shared/maintenance-resource';
import { type PendingOrderListItem } from './actions.server';

// ── Labels y badges de estado ─────────────────────────────────────────────────

export const PENDING_STATUS_LABELS: Record<string, string> = {
  pending_scheduling: 'Pendiente Planificar',
  scheduled: 'Pendiente Aprobación',
};

// ── Labels de origen ──────────────────────────────────────────────────────────

export const SOURCE_LABELS: Record<string, string> = {
  checklist: 'Checklist',
  manual: 'Manual',
  preventive: 'Preventivo',
};

export const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  checklist: ClipboardList,
  manual: Wrench,
  preventive: Shield,
};

type StatusVariant = 'warning' | 'secondary';

const STATUS_BADGE_CONFIG: Record<string, { label: string; variant: StatusVariant }> = {
  pending_scheduling: { label: 'Pendiente Planificar', variant: 'warning' },
  scheduled: { label: 'Pendiente Aprobación', variant: 'secondary' },
};

export const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pending_scheduling: HourglassIcon,
  scheduled: Clock,
};

// ── Columnas ocultas por defecto ──────────────────────────────────────────────
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at', 'source'];

// ── Interfaz de callbacks para acciones ──────────────────────────────────────

export interface PendingOrdersColumnCallbacks {
  onView: (order: PendingOrderListItem) => void;
  onSchedule: (order: PendingOrderListItem) => void;
  onViewHistory: (order: PendingOrderListItem) => void;
  /** Ticket 676: el taller rechaza el pedido indicando un motivo obligatorio */
  onReject: (order: PendingOrderListItem) => void;
}

// ── Definición de columnas ────────────────────────────────────────────────────

export function getPendingOrderColumns(callbacks: PendingOrdersColumnCallbacks): ColumnDef<PendingOrderListItem>[] {
  return [
    // ── Estado ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'status',
      id: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const status = row.original.status;
        const config = STATUS_BADGE_CONFIG[status] ?? { label: status, variant: 'secondary' as const };
        const Icon = STATUS_ICONS[status];
        return (
          <Badge variant={config.variant} className="gap-1 whitespace-nowrap">
            {Icon && <Icon className="h-3 w-3" />}
            {config.label}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },

    // ── Equipo / Vehículo ────────────────────────────────────────────────────
    {
      id: 'vehicle',
      // Ticket 596: la fila puede ser de un vehiculo o de un equipamiento
      accessorFn: (row) => getResourceLabel(row),
      meta: { title: 'Equipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
      cell: ({ row }) => {
        const internNumber = getResourceInternNumber(row.original);
        return (
          <div className="flex flex-col">
            <span className="font-medium">{getResourceLabel(row.original)}</span>
            <span className="text-xs text-muted-foreground">
              {getResourceKindLabel(row.original)}
              {internNumber ? ` · #${internNumber}` : ''}
            </span>
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const resourceId = row.original.vehicles?.id ?? row.original.other_equipment?.id;
        if (!resourceId) return false;
        return value.includes(resourceId);
      },
      enableSorting: false,
    },

    // ── Número de Pedido ──────────────────────────────────────────────────────
    {
      accessorKey: 'order_number',
      id: 'order_number',
      meta: { title: 'Nro. Pedido' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nro. Pedido" />,
      cell: ({ row }) => {
        const num = row.original.order_number;
        return <span className="font-mono text-sm">{num ?? '—'}</span>;
      },
    },

    // ── Descripción del pedido ────────────────────────────────────────────────
    {
      id: 'description',
      accessorFn: (row) => row.description ?? row.maintenance_requests?.description ?? '',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => {
        const value = row.original.description ?? row.original.maintenance_requests?.description ?? '';
        if (!value) return <span className="text-muted-foreground">—</span>;
        const truncated = value.length > 60 ? `${value.slice(0, 60)}…` : value;
        return (
          <span className="block max-w-[280px] truncate" title={value}>
            {truncated}
          </span>
        );
      },
      enableSorting: false,
    },

    // ── Origen del pedido ─────────────────────────────────────────────────────
    {
      accessorKey: 'source',
      id: 'source',
      meta: { title: 'Origen' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Origen" />,
      cell: ({ row }) => {
        const src = row.original.source;
        if (!src) return <span className="text-muted-foreground">—</span>;
        const label = SOURCE_LABELS[src] ?? src;
        const Icon = SOURCE_ICONS[src];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },

    // ── Fecha de Aprobación (created_at) ─────────────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Fecha Aprobación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Aprobación" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        return <span>{date ? formatArgentinaDateTime(date) : '—'}</span>;
      },
    },

    // ── Fecha Planificada ─────────────────────────────────────────────────────
    {
      accessorKey: 'scheduled_date',
      id: 'scheduled_date',
      meta: { title: 'Fecha Planificada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Planificada" />,
      cell: ({ row }) => {
        const date = row.original.scheduled_date;
        if (!date) return <span className="text-muted-foreground">Sin planificar</span>;
        // `scheduled_date` es @db.Date (medianoche UTC): se lee por el día UTC para no correrlo.
        return <span>{moment.utc(date).format('DD/MM/YYYY')}</span>;
      },
    },

    // ── Items ─────────────────────────────────────────────────────────────────
    {
      id: 'items',
      accessorFn: (row) => row._count.maintenance_order_items,
      meta: { title: 'Items' },
      header: 'Items',
      cell: ({ row }) => {
        const count = row.original._count.maintenance_order_items;
        if (count === 0 && row.original.source === 'preventive') {
          return <PreventiveItemsBadge preventiveType={row.original.preventive_type ?? ''} />;
        }
        return (
          <Badge variant="secondary">
            {count} {count === 1 ? 'item' : 'items'}
          </Badge>
        );
      },
      enableSorting: false,
    },

    // ── Acciones ──────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const order = row.original;
        const isPendingScheduling = order.status === 'pending_scheduling';

        return (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => callbacks.onView(order)}
              title="Ver detalle"
              aria-label="Ver detalle"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => callbacks.onViewHistory(order)}
              title="Ver historial"
              aria-label="Ver historial"
              className="text-purple-600 hover:text-purple-700"
            >
              <History className="h-4 w-4" />
            </Button>
            {/* Planificar la fecha requiere `update` en esta tab (ver permissions-map). */}
            {isPendingScheduling && (
              <PermissionGuard module="mantenimiento" tab="pedidos_pendientes" action="update">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => callbacks.onSchedule(order)}
                  title="Planificar fecha"
                  aria-label="Planificar fecha"
                  className="text-blue-600 hover:text-blue-700"
                >
                  <Calendar className="h-4 w-4" />
                </Button>
              </PermissionGuard>
            )}
            {/* Ticket 676: rechazo del taller (ej. solicitud duplicada). Se oculta
                la accion puntual, nunca la columna completa. */}
            {isPendingScheduling && (
              <PermissionGuard module="mantenimiento" tab="pedidos_pendientes" action="update">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => callbacks.onReject(order)}
                  title="Rechazar pedido"
                  aria-label="Rechazar pedido"
                  className="text-destructive hover:text-destructive"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </PermissionGuard>
            )}
          </div>
        );
      },
    },
  ];
}
