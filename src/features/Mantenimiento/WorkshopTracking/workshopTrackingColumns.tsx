'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PreventiveItemsBadge } from '@/features/Mantenimiento/components/PreventiveItemsBadge';
import {
  getResourceCondition,
  getResourceInternNumber,
  getResourceKind,
  getResourceLabel,
} from '@/features/Mantenimiento/shared/maintenance-resource';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { conditionLabels } from '@/shared/utils/mappers';
import { type ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CalendarClock, CheckCircle2, Circle, Clock, Eye, History, Play, XCircle } from 'lucide-react';
import moment from 'moment';
import { argentinaDate, formatArgentinaDay } from '@/shared/lib/argentina-time';
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
  variant: 'default' | 'info' | 'yellow' | 'success' | 'secondary' | 'destructive';
  icon: LucideIcon;
};

export const WORKSHOP_STATUS_CONFIG: Record<string, StatusConfig> = {
  pending_scheduling: {
    label: 'Pendiente de planificar fecha de taller',
    variant: 'yellow',
    icon: CalendarClock,
  },
  date_confirmed: { label: 'Pendiente de ingreso a taller', variant: 'secondary', icon: Clock },
  in_workshop: { label: 'En Taller', variant: 'info', icon: Play },
  pending_workshop_validation: { label: 'Pend. Validación Taller', variant: 'yellow', icon: Clock },
  operations_rejected: { label: 'Rechazada por Ops', variant: 'destructive', icon: XCircle },
  workshop_rejected: { label: 'Rechazada por Taller', variant: 'destructive', icon: XCircle },
  completed: { label: 'Completada', variant: 'success', icon: CheckCircle2 },
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

// ============================================================================
// HELPER: Sector status from work orders
// ============================================================================

type MaintenanceOrderItem = WorkshopTrackingListItem['maintenance_order_items'][number];

function getSectorStatus(sectorItems: MaintenanceOrderItem[]): 'completed' | 'in_progress' | 'pending' {
  const repairs = sectorItems.flatMap((item) => {
    const wo = item.work_orders;
    if (!wo) return [];
    const woi = wo.work_order_items ?? [];
    return woi.filter((w) => w.maintenance_order_item_id === item.id).flatMap((w) => w.work_order_item_repairs ?? []);
  });

  if (repairs.length === 0) return 'pending';
  const completed = repairs.filter((r) => r.status === 'completed').length;
  if (completed === repairs.length) return 'completed';
  if (completed > 0 || repairs.some((r) => r.status === 'in_progress')) return 'in_progress';
  return 'pending';
}

/** Días completos desde un instante hasta hoy, contando por día argentino (no por hora del navegador/servidor). */
function daysSinceArgentinaDay(value: Date | string): number {
  return moment.utc(argentinaDate()).diff(moment.utc(argentinaDate(new Date(value))), 'days');
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
    // ── N° Orden ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'order_number',
      id: 'order_number',
      meta: { title: 'N° Orden' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Orden" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.order_number || '-'}</span>,
    },

    // ── Equipo (vehículo o equipamiento — ticket 596) ─────────────────────────
    {
      id: 'vehicle',
      meta: { title: 'Equipo' },
      accessorFn: (row) => getResourceLabel(row),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
      cell: ({ row }) => {
        const internNumber = getResourceInternNumber(row.original);
        const isOther = getResourceKind(row.original) === 'other_equipment';
        return (
          <div className="min-w-0">
            <span className="font-medium">{getResourceLabel(row.original)}</span>
            {internNumber && <span className="text-muted-foreground ml-1 text-xs">({internNumber})</span>}
            {/* En una tabla donde conviven ambos, "AB093KH" y "CT-4471" no se
                distinguen solos: el equipamiento se marca explícitamente. */}
            {isOther && (
              <Badge variant="outline" className="ml-2 text-xs">
                Equipamiento
              </Badge>
            )}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const resourceId = row.original.vehicles?.id ?? row.original.other_equipment?.id;
        if (resourceId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(resourceId);
      },
      enableSorting: true,
    },

    // ── Items ────────────────────────────────────────────────────────────────
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

    // ── Condición del vehículo ───────────────────────────────────────────────
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

    // ── Kilometraje ──────────────────────────────────────────────────────────
    {
      id: 'kilometer',
      accessorFn: (row) => row.vehicles?.kilometer ?? null,
      meta: { title: 'Km Actual' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Km Actual" />,
      cell: ({ row }) => {
        const km = row.original.vehicles?.kilometer;
        if (!km) return <span className="text-muted-foreground">-</span>;
        return <span>{Number(km).toLocaleString('es-AR')} km</span>;
      },
      enableSorting: false,
    },

    // ── Ingreso a Taller ─────────────────────────────────────────────────────
    {
      accessorKey: 'workshop_entry_date',
      id: 'workshop_entry_date',
      meta: { title: 'Ingreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ingreso" />,
      cell: ({ row }) => {
        const date = row.original.workshop_entry_date;
        return <span>{date ? formatArgentinaDay(date) : '-'}</span>;
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
        const variant: 'destructive' | 'warning' | 'secondary' =
          days > 7 ? 'destructive' : days > 3 ? 'warning' : 'secondary';
        return (
          <Badge variant={variant}>
            {days} {days === 1 ? 'día' : 'días'}
          </Badge>
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
        const items = row.original.maintenance_order_items ?? [];

        // Agrupar items por sector con su orden de secuencia
        const sectorMap = new Map<string, { name: string; seq: number; items: typeof items }>();
        items.forEach((item) => {
          const sectorId = item.assigned_sector_id;
          if (!sectorId) return;
          const sectorName = item.workshop_sectors?.name ?? 'Sin sector';
          if (!sectorMap.has(sectorId)) {
            sectorMap.set(sectorId, {
              name: sectorName,
              seq: item.sector_sequence_order ?? 999,
              items: [],
            });
          }
          sectorMap.get(sectorId)!.items.push(item);
        });

        const sectors = Array.from(sectorMap.values()).sort((a, b) => a.seq - b.seq);
        if (sectors.length === 0) {
          return <Badge variant="outline">Sin asignar</Badge>;
        }

        return (
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-1 flex-wrap">
              {sectors.map((sector, idx) => {
                const status = getSectorStatus(sector.items);
                const Icon = status === 'completed' ? CheckCircle2 : status === 'in_progress' ? Play : Circle;
                const statusLabel =
                  status === 'completed' ? 'Completado' : status === 'in_progress' ? 'En progreso' : 'Pendiente';
                return (
                  <Tooltip key={`${sector.name}-${idx}`}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1">
                        {idx > 0 && <span className="text-muted-foreground text-[10px]">&rarr;</span>}
                        <Badge
                          variant={status === 'completed' ? 'secondary' : status === 'in_progress' ? 'info' : 'outline'}
                          className={`text-[10px] gap-1 ${status === 'completed' ? 'opacity-50 line-through' : ''}`}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {sector.name}
                        </Badge>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span>
                        {sector.name} — {statusLabel}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        );
      },
      enableSorting: false,
    },

    // ── Estado ───────────────────────────────────────────────────────────────
    {
      accessorKey: 'status',
      id: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const status = row.original.status ?? '';
        const config = WORKSHOP_STATUS_CONFIG[status] ?? {
          label: status || 'Sin estado',
          variant: 'secondary' as const,
          icon: AlertCircle,
        };
        const Icon = config.icon;
        return (
          <Badge variant={config.variant} className="gap-1">
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Progreso (virtual — calculado) ───────────────────────────────────────
    {
      id: 'progress',
      meta: { title: 'Progreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Progreso" />,
      cell: ({ row }) => {
        const { percent, completed, total } = calculateRepairProgress(row.original.maintenance_order_items);
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 min-w-[120px] cursor-default">
                  <Progress value={percent} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {completed} de {total} reparaciones completadas
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      enableSorting: false,
    },

    // ── Fecha de creación ─────────────────────────────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Creado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        return <span>{date ? formatArgentinaDay(date) : '-'}</span>;
      },
    },

    // ── Descripción del pedido (oculta por defecto) ──────────────────────────
    {
      id: 'description',
      accessorFn: (row) => row.description ?? row.maintenance_requests?.description ?? '',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => {
        const value = row.original.description ?? row.original.maintenance_requests?.description ?? '';
        if (!value) return <span className="text-muted-foreground">-</span>;
        const truncated = value.length > 60 ? `${value.slice(0, 60)}…` : value;
        return (
          <span title={value} className="block max-w-[240px] truncate">
            {truncated}
          </span>
        );
      },
      enableSorting: false,
    },

    // ── Acciones ─────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => onViewDetail(row.original)} className="gap-1">
            <Eye className="h-4 w-4" />
            Ver
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onViewHistory(row.original)}
            title="Ver historial"
            aria-label="Ver historial"
            className="text-purple-600 hover:text-purple-700"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      ),
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
    status: (val: unknown) => {
      const s = val as string;
      return WORKSHOP_STATUS_CONFIG[s]?.label ?? s ?? '';
    },
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
    sector_journey: (_val: unknown, row: WorkshopTrackingListItem) => {
      const items = row.maintenance_order_items ?? [];
      const sectorMap = new Map<string, { name: string; seq: number }>();
      items.forEach((item) => {
        if (!item.assigned_sector_id) return;
        if (!sectorMap.has(item.assigned_sector_id)) {
          sectorMap.set(item.assigned_sector_id, {
            name: item.workshop_sectors?.name ?? 'Sin sector',
            seq: item.sector_sequence_order ?? 999,
          });
        }
      });
      const sorted = Array.from(sectorMap.values()).sort((a, b) => a.seq - b.seq);
      return sorted.map((s) => s.name).join(' → ') || 'Sin asignar';
    },
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
    description: (_val: unknown, row: WorkshopTrackingListItem) =>
      row.description ?? row.maintenance_requests?.description ?? '',
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
