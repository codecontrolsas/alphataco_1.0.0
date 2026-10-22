'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { PreventiveItemsBadge } from '@/features/Mantenimiento/components/PreventiveItemsBadge';
import {
  getResourceCondition,
  getResourceInternNumber,
  getResourceLabel,
} from '@/features/Mantenimiento/shared/maintenance-resource';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { cn } from '@/lib/utils';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { conditionLabels } from '@/shared/utils/mappers';
import { type ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { Eye, History, MoreHorizontal } from 'lucide-react';
import moment from 'moment';
import { argentinaDate, formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { MaintenanceOrderStatus } from '../lib/order-status';
import { ATTENTION_THRESHOLDS } from '../lib/attention-thresholds';
import { buildSectorRoute } from '../lib/sector-route';
import {
  ORDER_STATUS_FILTER_ORDER,
  ORDER_STATUS_UI,
  TONE_TO_BADGE,
  getStatusLabel,
  type BadgeVariant,
} from '../lib/status-presentation';
import { MaintenanceStatusPill } from '../shared/components/MaintenanceStatusPill';
import { ResourceCell, toResourceCellResource } from '../shared/components/ResourceCell';
import { SectorRoute } from '../shared/components/SectorRoute';
import { calculateRepairProgress } from '../utils/repairProgress';
import type { WorkshopTrackingListItem } from './actions.server';

// ============================================================================
// CONDITION CONFIG
// ============================================================================

export const conditionVariants: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  operativo: 'success',
  no_operativo: 'destructive',
  en_reparacion: 'destructive',
  operativo_condicionado: 'warning',
  en_preparacion: 'secondary',
};

// ============================================================================
// STATUS CONFIG
// ============================================================================

type StatusConfig = {
  label: string;
  variant: BadgeVariant;
  icon: LucideIcon;
};

/** Estados que Seguimiento sabe mostrar y ofrecer en su filtro, con la presentación oficial. */
const WORKSHOP_TRACKING_PRESENTED_STATUSES = [
  'pending_scheduling',
  'date_confirmed',
  'in_workshop',
  'pending_workshop_validation',
  'operations_rejected',
  'workshop_rejected',
  'rejected',
  'completed',
] as const satisfies readonly MaintenanceOrderStatus[];

export const WORKSHOP_STATUS_CONFIG: Record<string, StatusConfig> = Object.fromEntries(
  ORDER_STATUS_FILTER_ORDER.filter((status) =>
    (WORKSHOP_TRACKING_PRESENTED_STATUSES as readonly string[]).includes(status)
  ).map((status) => {
    const ui = ORDER_STATUS_UI[status];
    return [status, { label: ui.label, variant: TONE_TO_BADGE[ui.tone], icon: ui.icon }];
  })
);

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

/** Columnas atómicas que no se borran: quedan ocultas y se pueden activar desde el selector de columnas. */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'items_count',
  'condition',
  'kilometer',
  'created_at',
  'description',
];

/** Días completos desde un instante hasta hoy, contando por día argentino (no por hora del navegador/servidor). */
function daysSinceArgentinaDay(value: Date | string): number {
  return moment.utc(argentinaDate()).diff(moment.utc(argentinaDate(new Date(value))), 'days');
}

/** Descripción del pedido: la de la orden o, si no tiene, la de la solicitud que la originó. */
function getOrderDescription(order: WorkshopTrackingListItem): string {
  return order.description ?? order.maintenance_requests?.description ?? '';
}

/** Subtipo del recurso (tipo de vehículo o de equipamiento), que va bajo la patente. */
function getResourceSubtitle(order: WorkshopTrackingListItem): string | null {
  return order.vehicles?.types_of_vehicles?.name ?? order.other_equipment?.type?.name ?? null;
}

// ============================================================================
// COLUMNS
// ============================================================================

interface ColumnsProps {
  onViewDetail: (order: WorkshopTrackingListItem) => void;
  onViewHistory: (order: WorkshopTrackingListItem) => void;
}

export function getWorkshopTrackingColumns({
  onViewDetail,
  onViewHistory,
}: ColumnsProps): ColumnDef<WorkshopTrackingListItem>[] {
  return [
    // ── N° Orden (compuesta: número + descripción) ───────────────────────────
    // Sigue siendo la columna `order_number` (ordenable, con su filtro de texto y su export): lo
    // compuesto es solo la celda. La primera celda abre el detalle.
    {
      accessorKey: 'order_number',
      id: 'order_number',
      meta: { title: 'N° Orden' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Orden" />,
      cell: ({ row }) => {
        const order = row.original;
        const description = getOrderDescription(order);
        return (
          <div className="flex min-w-0 max-w-[260px] flex-col items-start">
            {order.order_number ? (
              <button
                type="button"
                onClick={() => onViewDetail(order)}
                aria-label={`Ver detalle de la orden ${order.order_number}`}
                className="focus-visible:ring-ring rounded-sm text-left font-mono text-sm font-semibold tabular-nums hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {order.order_number}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onViewDetail(order)}
                aria-label="Ver detalle del pedido, todavía sin N° de orden"
                className="text-muted-foreground focus-visible:ring-ring rounded-sm text-left text-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                Se asigna al ingresar
              </button>
            )}
            {description ? (
              <span title={description} className="text-muted-foreground block max-w-full truncate text-xs">
                {description}
              </span>
            ) : null}
          </div>
        );
      },
    },

    // ── Equipo (vehículo o equipamiento — ticket 596) ─────────────────────────
    {
      id: 'vehicle',
      meta: { title: 'Equipo' },
      accessorFn: (row) => getResourceLabel(row),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
      cell: ({ row }) => <ResourceCell resource={toResourceCellResource(row.original, getResourceSubtitle(row.original))} />,
      filterFn: (row, _id, value: string[]) => {
        const resourceId = row.original.vehicles?.id ?? row.original.other_equipment?.id;
        if (resourceId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(resourceId);
      },
      enableSorting: true,
    },

    // ── Estado ───────────────────────────────────────────────────────────────
    {
      accessorKey: 'status',
      id: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <MaintenanceStatusPill entity="order" status={row.original.status} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Fecha Planificada ────────────────────────────────────────────────────
    {
      id: 'scheduled_date',
      accessorKey: 'scheduled_date',
      meta: { title: 'Fecha Planificada' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Planificada" />,
      cell: ({ row }) => {
        const date = row.original.scheduled_date;
        if (!date) return <span className="text-muted-foreground">-</span>;

        // `scheduled_date` es @db.Date (medianoche UTC) y "hoy" es el día argentino.
        const scheduledDate = moment.utc(date);
        const today = moment.utc(argentinaDate());
        const isToday = scheduledDate.isSame(today, 'day');
        const isTomorrow = scheduledDate.isSame(today.clone().add(1, 'day'), 'day');
        // Solo es un problema si el pedido seguía esperando el ingreso: en cualquier otro estado la fecha ya se cumplió.
        const missedEntry = row.original.status === 'date_confirmed' && scheduledDate.isBefore(today);

        return (
          <div className="flex flex-col leading-tight">
            <span className={cn('tabular-nums', missedEntry && 'text-danger-subtle-foreground font-semibold')}>
              {scheduledDate.format('DD/MM/YYYY')}
            </span>
            {missedEntry ? (
              <span className="text-danger-subtle-foreground text-xs font-semibold">Pasó sin ingreso</span>
            ) : null}
            {isToday ? <span className="text-muted-foreground text-xs">Hoy</span> : null}
            {isTomorrow ? <span className="text-muted-foreground text-xs">Mañana</span> : null}
          </div>
        );
      },
    },

    // ── Ingreso a Taller ─────────────────────────────────────────────────────
    {
      accessorKey: 'workshop_entry_date',
      id: 'workshop_entry_date',
      meta: { title: 'Ingreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ingreso" />,
      cell: ({ row }) => {
        const date = row.original.workshop_entry_date;
        return date ? (
          <span className="tabular-nums">{formatArgentinaDay(date)}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },

    // ── Días en Taller (virtual — calculado) ─────────────────────────────────
    {
      id: 'days_in_workshop',
      meta: { title: 'Días en Taller' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Días en Taller" />,
      cell: ({ row }) => {
        const date = row.original.workshop_entry_date;
        if (!date) return <span className="text-muted-foreground">-</span>;
        const days = daysSinceArgentinaDay(date);
        // Mismo criterio que la tarjeta "Más de N días" (attention=overdue): solo órdenes todavía en taller.
        const overdue = row.original.status === 'in_workshop' && days > ATTENTION_THRESHOLDS.inWorkshopDays;
        return (
          <span className={cn('tabular-nums', overdue && 'text-danger-subtle-foreground font-semibold')}>
            {days} {days === 1 ? 'día' : 'días'}
            {overdue ? <span className="sr-only"> (fuera de plazo)</span> : null}
          </span>
        );
      },
      enableSorting: false,
    },

    // ── Recorrido Sectores (virtual — calculado) ──────────────────────────────
    {
      id: 'sector_journey',
      meta: { title: 'Recorrido Sectores' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Recorrido Sectores" />,
      cell: ({ row }) => {
        const route = buildSectorRoute(row.original.maintenance_order_items);
        // Antes de ingresar no hay OTs que esperar: "Sin programar"/"Sin OTs generadas" cambian el tono según la etapa.
        const beforeEntry = ['pending_scheduling', 'date_confirmed', 'rejected'].includes(row.original.status);
        return (
          <SectorRoute
            sectors={route}
            emptyLabel={beforeEntry ? 'Aún sin ingresar' : 'Sin OTs generadas'}
            emptyTone={beforeEntry ? 'muted' : 'warn'}
          />
        );
      },
      enableSorting: false,
    },

    // ── Progreso (virtual — calculado) ───────────────────────────────────────
    {
      id: 'progress',
      meta: { title: 'Progreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Progreso" />,
      cell: ({ row }) => {
        const { percent, completed, total } = calculateRepairProgress(row.original.maintenance_order_items);
        if (total === 0) return <span className="text-muted-foreground text-xs">Sin tareas</span>;
        return (
          <div
            className="flex min-w-[120px] items-center gap-2"
            title={`${completed} de ${total} reparaciones completadas`}
          >
            <Progress
              value={percent}
              className="h-2 flex-1"
              aria-label={`Progreso: ${completed} de ${total} reparaciones completadas`}
            />
            <span className="text-muted-foreground text-xs tabular-nums">{percent}%</span>
          </div>
        );
      },
      enableSorting: false,
    },

    // ── Items (oculta por defecto) ───────────────────────────────────────────
    {
      id: 'items_count',
      accessorFn: (row) => row.maintenance_order_items?.length ?? 0,
      meta: { title: 'Items' },
      header: 'Items',
      cell: ({ row }) => {
        const count = row.original.maintenance_order_items?.length ?? 0;
        if (count === 0 && row.original.maintenance_requests?.source === 'preventive') {
          return <PreventiveItemsBadge preventiveType={row.original.maintenance_requests?.preventive_type ?? ''} />;
        }
        return (
          <Badge variant="secondary">
            {count} {count === 1 ? 'item' : 'items'}
          </Badge>
        );
      },
      enableSorting: false,
    },

    // ── Condición del vehículo (oculta por defecto) ──────────────────────────
    {
      id: 'condition',
      accessorFn: (row) => getResourceCondition(row),
      meta: { title: 'Condición Actual' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Condición Actual" />,
      cell: ({ row }) => {
        const condition = getResourceCondition(row.original);
        const label = condition ? conditionLabels[condition] ?? condition : 'Sin datos';
        const variant = condition ? conditionVariants[condition] ?? 'secondary' : 'secondary';
        return <Badge variant={variant}>{label}</Badge>;
      },
      enableSorting: false,
      filterFn: (row, _id, value: string[]) => {
        const cond = getResourceCondition(row.original);
        if (cond == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(cond);
      },
    },

    // ── Kilometraje (oculta por defecto) ─────────────────────────────────────
    {
      id: 'kilometer',
      accessorFn: (row) => row.vehicles?.kilometer ?? null,
      meta: { title: 'Km Actual' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Km Actual" />,
      cell: ({ row }) => {
        const km = row.original.vehicles?.kilometer;
        if (!km) return <span className="text-muted-foreground">-</span>;
        return <span className="tabular-nums">{Number(km).toLocaleString('es-AR')} km</span>;
      },
      enableSorting: false,
    },

    // ── Fecha de creación (oculta por defecto) ───────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Creado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        return <span className="tabular-nums">{date ? formatArgentinaDay(date) : '-'}</span>;
      },
    },

    // ── Descripción del pedido (oculta por defecto: ya se ve bajo el N° Orden) ──
    {
      id: 'description',
      accessorFn: (row) => getOrderDescription(row),
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => {
        const value = getOrderDescription(row.original);
        if (!value) return <span className="text-muted-foreground">-</span>;
        return (
          <span title={value} className="block max-w-[240px] truncate">
            {value}
          </span>
        );
      },
      enableSorting: false,
    },

    // ── Acciones ─────────────────────────────────────────────────────────────
    // Ver el detalle y el historial exigen `seguimiento_taller:view`, la misma clave que la lista y
    // `getMaintenanceOrderDetail`. Validar o rechazar (`update`) vive dentro del panel de detalle.
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: '',
      cell: ({ row }) => {
        const orderLabel = row.original.order_number ?? getResourceLabel(row.original);
        return (
          <PermissionGuard module="mantenimiento" tab="seguimiento_taller" action="view">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={`Acciones de la orden ${orderLabel}`}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onViewDetail(row.original)}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onViewHistory(row.original)}>
                  <History className="h-4 w-4" aria-hidden="true" />
                  Historial
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </PermissionGuard>
        );
      },
    },
  ];
}

// ============================================================================
// STATUS FILTER LABELS/ICONS (para el fetchFacet lazy-load del filtro "Estado")
// ============================================================================

export const WORKSHOP_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(WORKSHOP_STATUS_CONFIG).map(([value, config]) => [value, config.label])
);

export const WORKSHOP_STATUS_ICONS: Record<string, LucideIcon | undefined> = Object.fromEntries(
  Object.entries(WORKSHOP_STATUS_CONFIG).map(([value, config]) => [value, config.icon])
);

// ============================================================================
// EXPORT CONFIG: formatters
// ============================================================================

export function getWorkshopTrackingExportFormatters() {
  return {
    // Mismo texto que la pastilla de la tabla (fuente única de estados)
    status: (val: unknown) => getStatusLabel('order', val as string | null),
    // Sin N° de orden la celda queda vacía (la tabla dice "Se asigna al ingresar")
    order_number: (val: unknown) => (val ? String(val) : ''),
    workshop_entry_date: (val: unknown) => {
      if (!val) return '';
      return formatArgentinaDay(val as string);
    },
    created_at: (val: unknown) => {
      if (!val) return '';
      return formatArgentinaDay(val as string);
    },
    vehicle: (_val: unknown, row: WorkshopTrackingListItem) => {
      const internNumber = getResourceInternNumber(row);
      return internNumber ? `${getResourceLabel(row)} (${internNumber})` : getResourceLabel(row);
    },
    sector_journey: (_val: unknown, row: WorkshopTrackingListItem) =>
      buildSectorRoute(row.maintenance_order_items)
        .map((sector) => sector.name)
        .join(' → ') || 'Sin asignar',
    progress: (_val: unknown, row: WorkshopTrackingListItem) => {
      const { percent } = calculateRepairProgress(row.maintenance_order_items);
      return `${percent}%`;
    },
    days_in_workshop: (_val: unknown, row: WorkshopTrackingListItem) => {
      const date = row.workshop_entry_date;
      if (!date) return '';
      const days = daysSinceArgentinaDay(date);
      return `${days} ${days === 1 ? 'día' : 'días'}`;
    },
    description: (_val: unknown, row: WorkshopTrackingListItem) => getOrderDescription(row),
    scheduled_date: (val: unknown) => {
      if (!val) return '';
      return moment.utc(val as string).format('DD/MM/YYYY');
    },
    condition: (_val: unknown, row: WorkshopTrackingListItem) => {
      const cond = getResourceCondition(row);
      return cond ? conditionLabels[cond] ?? cond : '';
    },
    kilometer: (_val: unknown, row: WorkshopTrackingListItem) => {
      const km = row.vehicles?.kilometer;
      return km ? Number(km).toLocaleString('es-AR') : '';
    },
    items_count: (_val: unknown, row: WorkshopTrackingListItem) => String(row.maintenance_order_items?.length ?? 0),
  };
}
