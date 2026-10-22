'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PreventiveItemsBadge } from '@/features/Mantenimiento/components/PreventiveItemsBadge';
import { ATTENTION_THRESHOLDS } from '@/features/Mantenimiento/lib/attention-thresholds';
import {
  LEGACY_HISTORY_LABELS,
  ORDER_STATUS_UI,
  TONE_TO_BADGE,
} from '@/features/Mantenimiento/lib/status-presentation';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { RelativeAge } from '@/features/Mantenimiento/shared/components/RelativeAge';
import { ResourceCell, toResourceCellResource } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { type ColumnDef } from '@tanstack/react-table';
import { Calendar, ClipboardList, Eye, History, Shield, Wrench, XCircle } from 'lucide-react';
import moment from 'moment';
import { getResourceLabel } from '../../shared/maintenance-resource';
import { OrderActionsMenu, type OrderMenuItem } from '../components/OrderActionsMenu';
import { type PendingOrderListItem } from './actions.server';

// ── Labels y badges de estado ─────────────────────────────────────────────────

export const PENDING_STATUS_LABELS: Record<string, string> = {
  pending_scheduling: ORDER_STATUS_UI.pending_scheduling.label,
  scheduled: ORDER_STATUS_UI.scheduled.label,
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

/** Íconos del filtro de estado: los mismos que dibuja la pastilla de la celda (misma fuente). */
export const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pending_scheduling: ORDER_STATUS_UI.pending_scheduling.icon,
  scheduled: ORDER_STATUS_UI.scheduled.icon,
};

// ── Columnas ocultas por defecto ──────────────────────────────────────────────
// Las atómicas que alimentan a la columna compuesta "N° Orden" quedan ocultas, no borradas: siguen siendo
// filtrables, ordenables y se exportan a Excel.
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['order_number', 'description', 'scheduled_date'];

/** Pasadas estas horas desde la aprobación el pedido se marca como atrasado (mismo corte que la tarjeta). */
const OVERDUE_HOURS = ATTENTION_THRESHOLDS.schedulingPendingDays * 24;

// ── Interfaz de callbacks para acciones ──────────────────────────────────────

export interface PendingOrdersColumnCallbacks {
  onView: (order: PendingOrderListItem) => void;
  onSchedule: (order: PendingOrderListItem) => void;
  onViewHistory: (order: PendingOrderListItem) => void;
  /** Ticket 676: el taller rechaza el pedido indicando un motivo obligatorio */
  onReject: (order: PendingOrderListItem) => void;
}

/** Permisos de la tab, resueltos en el servidor (`pedidos_pendientes:update`: planificar y rechazar). */
export interface PendingOrdersColumnPermissions {
  canUpdate: boolean;
}

// ── Definición de columnas ────────────────────────────────────────────────────

export function getPendingOrderColumns(
  callbacks: PendingOrdersColumnCallbacks,
  permissions: PendingOrdersColumnPermissions
): ColumnDef<PendingOrderListItem>[] {
  return [
    // ── Equipo / Vehículo ────────────────────────────────────────────────────
    {
      id: 'vehicle',
      // Ticket 596: la fila puede ser de un vehiculo o de un equipamiento
      accessorFn: (row) => getResourceLabel(row),
      ...titled('Equipo'),
      cell: ({ row }) => <ResourceCell resource={toResourceCellResource(row.original)} />,
      filterFn: (row, _id, value: string[]) => {
        const resourceId = row.original.vehicles?.id ?? row.original.other_equipment?.id;
        if (!resourceId) return false;
        return value.includes(resourceId);
      },
    },

    // ── N° Orden + descripción (compuesta, solo presentación) ─────────────────
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
            onClick={() => callbacks.onView(order)}
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

    // ── Estado ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'status',
      id: 'status',
      ...titled('Estado'),
      cell: ({ row }) => {
        const { status, date_rejected_at, date_rejection_reason } = row.original;
        // "Fecha rechazada" acompaña al estado (no lo reemplaza: el filtro de Estado sigue diciendo
        // "Pend. de programación"). Solo aplica mientras el pedido espera una fecha nueva.
        const dateRejected = status === 'pending_scheduling' && date_rejected_at != null;
        return (
          <div className="flex flex-col items-start gap-1">
            <MaintenanceStatusPill entity="order" status={status} />
            {dateRejected ? (
              <>
                <Badge variant={TONE_TO_BADGE.danger} className="whitespace-nowrap">
                  <XCircle aria-hidden="true" />
                  {LEGACY_HISTORY_LABELS.date_rejected}
                </Badge>
                {date_rejection_reason ? (
                  <span className="text-muted-foreground max-w-[220px] truncate text-xs" title={date_rejection_reason}>
                    {date_rejection_reason}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
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

    // ── Origen del pedido ─────────────────────────────────────────────────────
    {
      accessorKey: 'source',
      id: 'source',
      ...titled('Origen'),
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

    // ── Fecha de Aprobación (created_at) + antigüedad ─────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      ...titled('Fecha Aprobación'),
      cell: ({ row }) => {
        const { created_at, status } = row.original;
        if (!created_at) return <span className="text-muted-foreground">—</span>;
        // El corte solo importa mientras el pedido espera fecha; si ya está planificado no "atrasa".
        return (
          <RelativeAge
            value={created_at}
            thresholdHours={status === 'pending_scheduling' ? OVERDUE_HOURS : undefined}
          />
        );
      },
    },

    // ── N° Orden (atómica, oculta por defecto: filtro, orden y Excel) ─────────
    {
      accessorKey: 'order_number',
      id: 'order_number',
      ...titled('N° Orden'),
      cell: ({ row }) => {
        const num = row.original.order_number;
        return num ? (
          <span className="font-mono text-sm">{num}</span>
        ) : (
          <span className="text-muted-foreground">Se asigna al ingresar</span>
        );
      },
    },

    // ── Descripción del pedido (atómica, oculta por defecto) ──────────────────
    {
      id: 'description',
      accessorFn: (row) => row.description ?? row.maintenance_requests?.description ?? '',
      ...titled('Descripción'),
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

    // ── Fecha Planificada (oculta por defecto) ────────────────────────────────
    {
      accessorKey: 'scheduled_date',
      id: 'scheduled_date',
      ...titled('Fecha Planificada'),
      cell: ({ row }) => {
        const date = row.original.scheduled_date;
        if (!date) return <span className="text-muted-foreground">Sin planificar</span>;
        // `scheduled_date` es @db.Date (medianoche UTC): se lee por el día UTC para no correrlo.
        return <span>{moment.utc(date).format('DD/MM/YYYY')}</span>;
      },
    },

    // ── Acciones ──────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => {
        const order = row.original;
        const resourceLabel = getResourceLabel(order);
        const isPendingScheduling = order.status === 'pending_scheduling';
        // Planificar y rechazar exigen `update` en esta tab (mismo permiso que el servidor).
        const canAct = permissions.canUpdate && isPendingScheduling;

        const items: OrderMenuItem[] = [
          { key: 'view', label: 'Ver detalle', icon: Eye, onSelect: () => callbacks.onView(order) },
          { key: 'history', label: 'Ver historial', icon: History, onSelect: () => callbacks.onViewHistory(order) },
          ...(canAct
            ? [
                {
                  key: 'reject',
                  label: 'Rechazar pedido',
                  icon: XCircle,
                  destructive: true,
                  onSelect: () => callbacks.onReject(order),
                },
              ]
            : []),
        ];

        return (
          <div className="flex items-center justify-end gap-1">
            {canAct ? (
              <Button
                type="button"
                size="sm"
                onClick={() => callbacks.onSchedule(order)}
                aria-label={`Planificar ${resourceLabel}`}
              >
                <Calendar aria-hidden="true" />
                Planificar
              </Button>
            ) : null}
            <OrderActionsMenu resourceLabel={resourceLabel} items={items} />
          </div>
        );
      },
    },
  ];
}
