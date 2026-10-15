'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PreventiveItemsBadge } from '@/features/Mantenimiento/components/PreventiveItemsBadge';
import { ResourceCell, toResourceCellResource } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { cn } from '@/lib/utils';
import { conditionLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Eye,
  History,
  LogIn,
  Settings2,
  Shield,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import moment from 'moment';
import { argentinaDate, formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { getResourceCondition, getResourceLabel } from '../../shared/maintenance-resource';
import { OrderActionsMenu, type OrderMenuItem } from '../components/OrderActionsMenu';
import type { ConfirmedOrderListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

// Las atómicas que alimentan a la columna compuesta "N° Orden" quedan ocultas, no borradas: siguen siendo
// filtrables, ordenables y se exportan a Excel.
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'order_number',
  'description',
  'created_at',
  'date_approved_at',
  'source',
];

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

/** Íconos de la condición del equipo: los usan la pastilla de la celda y las opciones del filtro. */
export const CONDITION_ICONS: Record<string, LucideIcon> = {
  operativo: CheckCircle2,
  no_operativo: XCircle,
  en_reparacion: Wrench,
  operativo_condicionado: AlertCircle,
  en_preparacion: Settings2,
};

const CONDITION_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
  operativo: 'success',
  no_operativo: 'destructive',
  en_reparacion: 'destructive',
  operativo_condicionado: 'warning',
  en_preparacion: 'secondary',
};

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  /** `pedidos_confirmados:update`, resuelto en el servidor. */
  canApproveWorkshopEntry: boolean;
};

interface ColumnCallbacks {
  onView: (order: ConfirmedOrderListItem) => void;
  onApproveWorkshopEntry: (order: ConfirmedOrderListItem) => void;
  onViewHistory: (order: ConfirmedOrderListItem) => void;
  permissions: Permissions;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Fecha planificada (`@db.Date`, medianoche UTC) con su distancia a HOY en Argentina. Pasada la fecha sin que el
 * equipo haya ingresado se marca en rojo, y el texto ("hace N días") acompaña al color: nunca solo color.
 */
function ScheduledDay({ date }: { date: Date | string }) {
  const scheduled = moment.utc(date);
  const today = moment.utc(argentinaDate());
  const diff = scheduled.diff(today, 'days');

  const relative =
    diff === 0
      ? 'hoy'
      : diff === 1
        ? 'mañana'
        : diff > 1
          ? `en ${diff} días`
          : `hace ${-diff} ${diff === -1 ? 'día' : 'días'}`;

  return (
    <span className="block leading-tight" suppressHydrationWarning>
      <span className="block">{scheduled.format('DD/MM/YYYY')}</span>
      <span
        className={cn(
          'block text-[12.5px]',
          diff < 0 && 'text-danger-subtle-foreground font-semibold',
          diff === 0 && 'text-ok-subtle-foreground font-semibold',
          diff === 1 && 'text-warn-subtle-foreground',
          diff > 1 && 'text-muted-foreground'
        )}
      >
        {relative}
        {diff < 0 ? <span className="sr-only"> (fecha vencida)</span> : null}
      </span>
    </span>
  );
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
      cell: ({ row }) => <ResourceCell resource={toResourceCellResource(row.original)} />,
      filterFn: (row, _id, value: string[]) => {
        const resourceId = row.original.vehicles?.id ?? row.original.other_equipment?.id;
        if (resourceId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(resourceId);
      },
    },

    // ── N° Orden + descripción (compuesta, solo presentación) ──────────────
    {
      id: 'order',
      meta: { title: 'N° Orden y descripción', excludeFromExport: true },
      header: 'N° Orden',
      enableSorting: false,
      cell: ({ row }) => {
        const order = row.original;
        const description = order.description ?? order.maintenance_requests?.description ?? '';
        return (
          <button
            type="button"
            onClick={() => onView(order)}
            aria-label={`Ver detalle del pedido ${order.order_number ?? getResourceLabel(order)}`}
            className="focus-visible:ring-ring block max-w-[300px] rounded-sm text-left hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {order.order_number ? (
              <span className="block truncate font-mono text-sm font-semibold tabular-nums">{order.order_number}</span>
            ) : (
              <span className="text-muted-foreground block text-sm">Se asigna al ingresar</span>
            )}
            {description ? (
              <span className="text-muted-foreground block truncate text-[13px]" title={description}>
                {description}
              </span>
            ) : null}
          </button>
        );
      },
    },

    // ── Fecha planificada (scheduled_date) + distancia a hoy ───────────────
    {
      accessorKey: 'scheduled_date',
      id: 'scheduled_date',
      meta: { title: 'Fecha Planificada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Planificada" />,
      cell: ({ row }) => {
        const date = row.original.scheduled_date;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return <ScheduledDay date={date} />;
      },
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

    // ── Condición actual del equipo (campo en vehicles / other_equipment) ──
    {
      id: 'condition',
      // Ticket 596: la condicion sale del vehiculo o del equipamiento
      accessorFn: (row) => getResourceCondition(row),
      meta: { title: 'Condición Actual' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Condición Actual" />,
      cell: ({ row }) => {
        const condition = getResourceCondition(row.original);
        const label = condition ? (conditionLabels[condition] ?? condition) : 'Desconocido';
        const variant = condition ? (CONDITION_VARIANTS[condition] ?? 'secondary') : 'secondary';
        const Icon = condition ? CONDITION_ICONS[condition] : undefined;
        return (
          <Badge variant={variant} className="whitespace-nowrap">
            {Icon ? <Icon aria-hidden="true" /> : null}
            {label}
          </Badge>
        );
      },
      enableSorting: false,
      filterFn: (row, _id, value: string[]) => {
        const condition = getResourceCondition(row.original);
        if (condition == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(condition);
      },
    },

    // ── N° Orden (atómica, oculta por defecto: filtro, orden y Excel) ──────
    {
      accessorKey: 'order_number',
      id: 'order_number',
      meta: { title: 'N° Orden' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Orden" />,
      cell: ({ row }) => {
        const num = row.original.order_number;
        return num ? (
          <span className="font-mono text-sm">{num}</span>
        ) : (
          <span className="text-muted-foreground">Se asigna al ingresar</span>
        );
      },
    },

    // ── Descripción del pedido (atómica, oculta por defecto) ───────────────
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

    // ── Fecha aprobación (date_approved_at) — oculta por defecto ───────────
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
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => {
        const order = row.original;
        const resourceLabel = getResourceLabel(order);

        const items: OrderMenuItem[] = [
          { key: 'view', label: 'Ver detalle', icon: Eye, onSelect: () => onView(order) },
          { key: 'history', label: 'Ver historial', icon: History, onSelect: () => onViewHistory(order) },
        ];

        return (
          <div className="flex items-center justify-end gap-1">
            {/* Registrar el ingreso exige `update` en esta tab: sin el permiso la acción no se muestra. */}
            {permissions.canApproveWorkshopEntry ? (
              <Button
                type="button"
                size="sm"
                onClick={() => onApproveWorkshopEntry(order)}
                aria-label={`Registrar ingreso de ${resourceLabel}`}
              >
                <LogIn aria-hidden="true" />
                Registrar ingreso
              </Button>
            ) : null}
            <OrderActionsMenu resourceLabel={resourceLabel} items={items} />
          </div>
        );
      },
    },
  ];
}
