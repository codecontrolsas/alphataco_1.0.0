'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PreventiveItemsBadge } from '@/features/Mantenimiento/components/PreventiveItemsBadge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { conditionLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, Eye, History, LogIn, Shield, Wrench, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import { argentinaDate, formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import {
  getResourceCondition,
  getResourceInternNumber,
  getResourceKindLabel,
  getResourceLabel,
} from '../../shared/maintenance-resource';
import type { ConfirmedOrderListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at', 'date_approved_at', 'source'];

// ============================================================================
// SOURCE LABELS / ICONS (compartidos con tabla hermana)
// ============================================================================

export const SOURCE_LABELS: Record<string, string> = {
  checklist: 'Checklist',
  manual: 'Manual',
  preventive: 'Preventivo',
};

export const SOURCE_ICONS: Record<string, LucideIcon> = {
  checklist: ClipboardList,
  manual: Wrench,
  preventive: Shield,
};

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  canApproveWorkshopEntry: boolean;
};

interface ColumnCallbacks {
  onView: (order: ConfirmedOrderListItem) => void;
  onApproveWorkshopEntry: (order: ConfirmedOrderListItem) => void;
  onViewHistory: (order: ConfirmedOrderListItem) => void;
  permissions: Permissions;
}

// ============================================================================
// COLUMNS
// ============================================================================

export function getConfirmedOrderColumns({
  onView,
  onApproveWorkshopEntry,
  onViewHistory,
  permissions,
}: ColumnCallbacks): ColumnDef<ConfirmedOrderListItem>[] {
  return [
    // ── Equipo / Vehículo (FK → vehicles) ──────────────────────────────────
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
        if (resourceId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(resourceId);
      },
    },

    // ── Número de Pedido (order_number) ────────────────────────────────────
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

    // ── Fecha aprobación (date_approved_at) ────────────────────────────────
    {
      accessorKey: 'date_approved_at',
      id: 'date_approved_at',
      meta: { title: 'Fecha Aprobación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Aprobación" />,
      cell: ({ row }) => {
        const date = row.original.date_approved_at;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return <span>{formatArgentinaDateTime(date)}</span>;
      },
    },

    // ── Fecha planificada (scheduled_date) ─────────────────────────────────
    {
      accessorKey: 'scheduled_date',
      id: 'scheduled_date',
      meta: { title: 'Fecha Planificada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Planificada" />,
      cell: ({ row }) => {
        const date = row.original.scheduled_date;
        if (!date) return <span className="text-muted-foreground">-</span>;

        // Usar moment.utc para fechas tipo 'date' (YYYY-MM-DD) para evitar desfase de zona horaria
        const scheduledDate = moment.utc(date);
        // "Hoy" en hora argentina (el servidor corre en UTC y el navegador en cualquier zona).
        const today = moment.utc(argentinaDate());
        const isToday = scheduledDate.isSame(today, 'day');
        const isPast = scheduledDate.isBefore(today);
        const isTomorrow = scheduledDate.isSame(today.clone().add(1, 'day'), 'day');

        return (
          <div className="flex flex-col">
            <span
              className={
                isToday ? 'font-bold text-green-600' : isPast ? 'text-red-600' : isTomorrow ? 'text-orange-600' : ''
              }
            >
              {scheduledDate.format('DD/MM/YYYY')}
            </span>
            {isToday && <span className="text-xs text-green-600">Hoy</span>}
            {isPast && <span className="text-xs text-red-600">Vencido</span>}
            {isTomorrow && <span className="text-xs text-orange-600">Mañana</span>}
          </div>
        );
      },
    },

    // ── Descripción del pedido ─────────────────────────────────────────────
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

    // ── Items (cantidad de items en la orden) ──────────────────────────────
    {
      id: 'items',
      accessorFn: (row) => row.maintenance_order_items?.length ?? 0,
      meta: { title: 'Items' },
      header: 'Items',
      cell: ({ row }) => {
        const items = row.original.maintenance_order_items ?? [];
        if (items.length === 0 && row.original.maintenance_requests?.source === 'preventive') {
          return (
            <PreventiveItemsBadge
              preventiveType={row.original.preventive_type ?? row.original.maintenance_requests?.preventive_type ?? ''}
            />
          );
        }
        return (
          <Badge variant="secondary">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Badge>
        );
      },
      enableSorting: false,
    },

    // ── Condición actual del equipo (campo en vehicles) ────────────────────
    {
      id: 'condition',
      // Ticket 596: la condicion sale del vehiculo o del equipamiento
      accessorFn: (row) => getResourceCondition(row),
      meta: { title: 'Condición Actual' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Condición Actual" />,
      cell: ({ row }) => {
        const condition = getResourceCondition(row.original);
        const variantMap: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
          operativo: 'success',
          no_operativo: 'destructive',
          en_reparacion: 'destructive',
          operativo_condicionado: 'warning',
          en_preparacion: 'secondary',
        };
        const label = condition ? conditionLabels[condition] ?? condition : 'Desconocido';
        const variant = condition ? variantMap[condition] ?? 'secondary' : 'secondary';
        return <Badge variant={variant}>{label}</Badge>;
      },
      enableSorting: false,
      filterFn: (row, _id, value: string[]) => {
        const condition = getResourceCondition(row.original);
        if (condition == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(condition);
      },
    },

    // ── Creado en (created_at) — oculto por defecto ────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Fecha Creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Creación" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return <span>{formatArgentinaDateTime(date)}</span>;
      },
    },

    // ── Origen del pedido (source de maintenance_orders, con fallback a maintenance_requests) — oculto por defecto
    {
      id: 'source',
      accessorFn: (row) => row.source ?? row.maintenance_requests?.source ?? null,
      meta: { title: 'Origen' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Origen" />,
      cell: ({ row }) => {
        const src = row.original.source ?? row.original.maintenance_requests?.source;
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
      enableSorting: false,
      filterFn: (row, _id, value: string[]) => {
        const src = row.original.source ?? row.original.maintenance_requests?.source ?? null;
        if (src == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(src);
      },
    },

    // ── Acciones ──────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: 'Acciones',
      cell: ({ row }) => {
        const order = row.original;

        return (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onView(order)}
              title="Ver detalle"
              aria-label="Ver detalle"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onViewHistory(order)}
              title="Ver historial"
              aria-label="Ver historial"
              className="text-purple-600 hover:text-purple-700"
            >
              <History className="h-4 w-4" />
            </Button>
            {permissions.canApproveWorkshopEntry && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onApproveWorkshopEntry(order)}
                title="Aprobar Entrada a Taller"
                aria-label="Aprobar Entrada a Taller"
                className="text-green-600 hover:text-green-700"
              >
                <LogIn className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}
