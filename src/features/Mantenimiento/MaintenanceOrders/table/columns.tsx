'use client';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Eye, MoreHorizontal, Settings2, Wrench } from 'lucide-react';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { ORDER_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';
import { ATTENTION_THRESHOLDS } from '../../lib/attention-thresholds';
import { buildSectorRoute } from '../../lib/sector-route';
import { MaintenanceStatusPill } from '../../shared/components/MaintenanceStatusPill';
import { ResourceCell, toResourceCellResource } from '../../shared/components/ResourceCell';
import { SectorRoute } from '../../shared/components/SectorRoute';
import { getResourceLabel } from '../../shared/maintenance-resource';
// Import directo al modulo del boton (no hay barrel en `pdf/`): el boton carga
// react-pdf y el layout recien al hacer clic, asi que esta linea no mete el
// renderer en el chunk de la tabla.
import { MaintenanceOrderReportButton } from '../pdf/MaintenanceOrderReportButton';
import { computeCurrentSector } from '../utils/currentSector';
import type { MaintenanceOrderListItem } from './actions.server';
import { daysSinceArgentinaDay } from './lib/workshop-days';

// ============================================================================
// TYPES
// ============================================================================

type BadgeVariant = NonNullable<BadgeProps['variant']>;

type StatusType =
  | 'scheduled'
  | 'in_workshop'
  | 'pending_workshop_validation'
  | 'pending_operations_validation'
  | 'operations_rejected'
  | 'workshop_rejected'
  | 'completed';

// ============================================================================
// STATUS CONFIG
// ============================================================================

export const statusLabels: Record<string, string> = Object.fromEntries(
  Object.entries(ORDER_STATUS_UI).map(([status, ui]) => [status, ui.label])
);

export const statusVariants: Record<StatusType, BadgeVariant> = {
  scheduled: TONE_TO_BADGE[ORDER_STATUS_UI.scheduled.tone],
  in_workshop: TONE_TO_BADGE[ORDER_STATUS_UI.in_workshop.tone],
  pending_workshop_validation: TONE_TO_BADGE[ORDER_STATUS_UI.pending_workshop_validation.tone],
  pending_operations_validation: TONE_TO_BADGE[ORDER_STATUS_UI.pending_operations_validation.tone],
  operations_rejected: TONE_TO_BADGE[ORDER_STATUS_UI.operations_rejected.tone],
  workshop_rejected: TONE_TO_BADGE[ORDER_STATUS_UI.workshop_rejected.tone],
  completed: TONE_TO_BADGE[ORDER_STATUS_UI.completed.tone],
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

/**
 * Las columnas compuestas (N° Orden + descripción, Recorrido Sectores) reemplazan a estas atómicas, que
 * quedan ocultas y no borradas: siguen disponibles en el selector de columnas y alimentan sus filtros.
 */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['order_number', 'description', 'status', 'currentSector', 'created_at'];

// ============================================================================
// TYPES FOR CALLBACKS
// ============================================================================

interface ColumnCallbacks {
  onViewDetail: (order: MaintenanceOrderListItem) => void;
  onManageOrder?: (order: MaintenanceOrderListItem) => void;
  onViewItems?: (order: MaintenanceOrderListItem) => void;
}

// ============================================================================
// PROGRESS HELPER
// ============================================================================

function calculateProgress(order: MaintenanceOrderListItem): { total: number; completed: number; percent: number } {
  const items = order.maintenance_order_items ?? [];
  // Collect ALL repairs from all work orders
  const allRepairs = items.flatMap((item) => {
    const woItems = item.work_orders?.work_order_items ?? [];
    return woItems.flatMap((woi) => woi.work_order_item_repairs ?? []);
  });
  // Exclude cancelled and rejected from the count
  const activeRepairs = allRepairs.filter((r) => r.status !== 'cancelled' && r.status !== 'rejected');
  const total = activeRepairs.length;
  const completed = activeRepairs.filter((r) => r.status === 'completed').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

// ============================================================================
// CURRENT SECTOR HELPER
// ============================================================================

/** Ver `computeCurrentSector` en `../utils/currentSector` — lógica compartida con el filtro server-side. */
function getCurrentSector(order: MaintenanceOrderListItem) {
  return computeCurrentSector(order.maintenance_order_items);
}

/** Avisos de tareas que frenan la orden: esperan autorización o volvieron para reasignar. */
function getRouteNotices(order: MaintenanceOrderListItem): string[] {
  const statuses = new Set(
    (order.maintenance_order_items ?? []).flatMap((item) =>
      (item.work_orders?.work_order_items ?? []).flatMap((woi) =>
        (woi.work_order_item_repairs ?? []).map((repair) => repair.status)
      )
    )
  );
  const notices: string[] = [];
  if (statuses.has('pending_approval')) notices.push('Tarea pendiente de autorización');
  if (statuses.has('reassignment_requested')) notices.push('Tarea devuelta para reasignar');
  return notices;
}

/** Descripción del pedido, con el respaldo de la solicitud (misma que muestra la columna atómica). */
function getOrderDescription(order: MaintenanceOrderListItem): string {
  return order.description ?? order.maintenance_requests?.description ?? '';
}

// ============================================================================
// COLUMNS
// ============================================================================

export function getMaintenanceOrdersColumns({
  onViewDetail,
  onManageOrder,
  onViewItems,
}: ColumnCallbacks): ColumnDef<MaintenanceOrderListItem>[] {
  return [
    // ── N° Orden + descripción (compuesta: solo presentación) ──────────────
    // La primera celda abre el detalle. Las atómicas `order_number` y `description` siguen disponibles.
    {
      id: 'orderSummary',
      accessorFn: (row) => row.order_number ?? '',
      meta: { title: 'N° Orden y descripción', excludeFromExport: true },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Orden" />,
      enableSorting: false,
      cell: ({ row }) => {
        const order = row.original;
        const description = getOrderDescription(order);
        return (
          <button
            type="button"
            onClick={() => onViewDetail(order)}
            title="Ver detalle de la orden"
            className="focus-visible:ring-ring/50 block max-w-[260px] min-w-0 rounded text-left outline-none focus-visible:ring-[3px]"
          >
            {order.order_number ? (
              <span className="block font-mono text-sm font-semibold hover:underline">{order.order_number}</span>
            ) : (
              <span className="text-muted-foreground block text-sm">Se asigna al ingresar</span>
            )}
            {description ? (
              <span className="text-muted-foreground block truncate text-[13px]" title={description}>
                {description}
              </span>
            ) : null}
            {/* En Taller es el estado normal del paso: solo se rotula cuando es otro (rechazada, a validar…) */}
            {order.status !== 'in_workshop' ? (
              <span className="mt-1 block">
                <MaintenanceStatusPill entity="order" status={order.status} size="sm" />
              </span>
            ) : null}
          </button>
        );
      },
    },

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

    // ── Fecha de ingreso a taller + días en taller ─────────────────────────
    {
      accessorKey: 'workshop_entry_date',
      id: 'workshop_entry_date',
      meta: { title: 'Ingreso a Taller' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ingreso a Taller" />,
      cell: ({ row }) => {
        const date = row.original.workshop_entry_date;
        if (!date) return <span className="text-muted-foreground">-</span>;
        // Una orden completada ya no corre: sin la fecha de cierre a mano, no se calcula la estadía
        if (row.original.status === 'completed') return <span>{formatArgentinaDay(date)}</span>;

        const days = daysSinceArgentinaDay(date);
        const overdue = days > ATTENTION_THRESHOLDS.inWorkshopDays;
        return (
          <span className="block leading-tight" suppressHydrationWarning>
            <time dateTime={new Date(date).toISOString()}>{formatArgentinaDay(date)}</time>
            <span
              className={cn(
                'block text-[12.5px]',
                overdue ? 'text-danger-subtle-foreground font-semibold' : 'text-muted-foreground'
              )}
            >
              {days <= 0 ? 'Ingresó hoy' : `${days} ${days === 1 ? 'día' : 'días'} en taller`}
              {overdue ? <span className="sr-only"> (fuera de plazo)</span> : null}
            </span>
          </span>
        );
      },
    },

    // ── Recorrido por sectores (compuesta: reemplaza a "Sector Actual" + "Progreso") ──
    {
      id: 'sectorRoute',
      accessorFn: (row) =>
        buildSectorRoute(row.maintenance_order_items)
          .map((sector) => sector.name)
          .join(' › '),
      meta: { title: 'Recorrido Sectores', excludeFromExport: true },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Recorrido Sectores" />,
      enableSorting: false,
      cell: ({ row }) => {
        const notices = getRouteNotices(row.original);
        return (
          <div className="min-w-0 space-y-1">
            <SectorRoute sectors={buildSectorRoute(row.original.maintenance_order_items)} />
            {notices.map((notice) => (
              <span
                key={notice}
                className="text-warn-subtle-foreground flex items-center gap-1 text-[12.5px] font-medium"
              >
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                {notice}
              </span>
            ))}
          </div>
        );
      },
    },

    // ── Progreso (calculado desde work_order_item_repairs) ─────────────────
    {
      id: 'progress',
      accessorFn: (row) => calculateProgress(row).percent,
      meta: { title: 'Progreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Progreso" />,
      cell: ({ row }) => {
        const { percent, completed, total } = calculateProgress(row.original);
        return (
          <div className="flex min-w-[120px] items-center gap-2" title={`${completed} de ${total} tareas completadas`}>
            <Progress value={percent} className="h-2 flex-1" aria-label={`Progreso de la orden: ${percent}%`} />
            <span className="text-muted-foreground text-xs tabular-nums">{percent}%</span>
          </div>
        );
      },
      enableSorting: false,
    },

    // ── Necesidades (descripciones de los items no-diagnóstico) ────────────
    {
      id: 'descriptions',
      accessorFn: (row) =>
        (row.maintenance_order_items ?? [])
          .filter((i) => !i.is_diagnostico && i.description)
          .map((i) => i.description)
          .join(' • '),
      meta: { title: 'Necesidades' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Necesidades" />,
      cell: ({ row }) => {
        const items = (row.original.maintenance_order_items ?? []).filter((i) => !i.is_diagnostico && i.description);
        if (items.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
        const text = items.map((i) => i.description).join(' • ');
        return (
          <span className="line-clamp-2 max-w-xs text-sm" title={text}>
            {text}
          </span>
        );
      },
      enableSorting: false,
    },

    // ── Atómicas ocultas por defecto: N° Orden, Descripción, Estado, Sector actual, Fecha creación ──
    {
      accessorKey: 'order_number',
      id: 'order_number',
      meta: { title: 'N° Orden' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Orden" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.order_number ?? '-'}</span>,
    },
    {
      id: 'description',
      accessorFn: (row) => getOrderDescription(row),
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => {
        const value = getOrderDescription(row.original);
        if (!value) return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <span className="block max-w-[280px] truncate text-sm" title={value}>
            {value}
          </span>
        );
      },
      enableSorting: false,
    },
    // Sector actual (calculado desde items, filtrable server-side — ticket 675)
    {
      id: 'currentSector',
      accessorFn: (row) => getCurrentSector(row)?.name ?? '',
      meta: { title: 'Sector Actual' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector Actual" />,
      cell: ({ row }) => {
        const sector = getCurrentSector(row.original);
        if (!sector) return <Badge variant="outline">Sin asignar</Badge>;
        return <Badge variant="default">{sector.name}</Badge>;
      },
      filterFn: (row, _id, value: string[]) => {
        const sector = getCurrentSector(row.original);
        if (!sector) return value.includes(NULL_FILTER_VALUE);
        return value.includes(sector.id);
      },
      // Es una columna calculada sin campo en BD — el sort se resuelve server-side
      // vía subquery, no vía orderBy de Prisma, así que no es ordenable en la grilla.
      enableSorting: false,
    },
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
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Fecha Creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Creación" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        return <span>{date ? formatArgentinaDateTime(date) : '-'}</span>;
      },
    },

    // ── Acciones: "Gestionar" (primaria, con permiso) + PDF + menú ⋯ ───────
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: 'Acciones',
      cell: ({ row }) => {
        const order = row.original;
        const canManage = order.status === 'in_workshop' || order.status === 'workshop_rejected';
        const orderLabel = order.order_number ?? 'sin número';

        return (
          <div className="flex items-center gap-1">
            {/* Abrir el wizard exige `update` en la misma tab que valida el servidor (`access.ts`) */}
            {canManage && onManageOrder ? (
              <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="update">
                <Button type="button" variant="ghost" size="sm" onClick={() => onManageOrder(order)} title="Gestionar orden">
                  <Settings2 className="mr-1 h-4 w-4" aria-hidden="true" />
                  Gestionar
                </Button>
              </PermissionGuard>
            ) : null}
            <MaintenanceOrderReportButton orderId={order.id} orderNumber={order.order_number} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Más acciones de la orden ${orderLabel}`}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onViewDetail(order)}>
                  <Eye aria-hidden="true" />
                  Ver detalle
                </DropdownMenuItem>
                {onViewItems ? (
                  <DropdownMenuItem onSelect={() => onViewItems(order)}>
                    <Wrench aria-hidden="true" />
                    Ítems solicitados
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
