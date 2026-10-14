'use client';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Settings2, Wrench } from 'lucide-react';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { getResourceInternNumber, getResourceKindLabel, getResourceLabel } from '../../shared/maintenance-resource';
// Import directo al modulo del boton (no hay barrel en `pdf/`): el boton carga
// react-pdf y el layout recien al hacer clic, asi que esta linea no mete el
// renderer en el chunk de la tabla.
import { MaintenanceOrderReportButton } from '../pdf/MaintenanceOrderReportButton';
import { computeCurrentSector } from '../utils/currentSector';
import type { MaintenanceOrderListItem } from './actions.server';

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

export const statusLabels: Record<string, string> = {
  scheduled: 'Programada',
  in_workshop: 'En Taller',
  pending_workshop_validation: 'Pend. Validación Taller',
  pending_operations_validation: 'Pend. Validación Operaciones',
  operations_rejected: 'Rechazada por Ops',
  workshop_rejected: 'Rechazada por Taller',
  completed: 'Completada',
};

export const statusVariants: Record<StatusType, BadgeVariant> = {
  scheduled: 'warning',
  in_workshop: 'default',
  pending_workshop_validation: 'yellow',
  pending_operations_validation: 'yellow',
  operations_rejected: 'destructive',
  workshop_rejected: 'destructive',
  completed: 'success',
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

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

// ============================================================================
// COLUMNS
// ============================================================================

export function getMaintenanceOrdersColumns({
  onViewDetail,
  onManageOrder,
  onViewItems,
}: ColumnCallbacks): ColumnDef<MaintenanceOrderListItem>[] {
  return [
    // ── N° Orden ───────────────────────────────────────────────────────────
    {
      accessorKey: 'order_number',
      id: 'order_number',
      meta: { title: 'N° Orden' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Orden" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.order_number ?? '-'}</span>,
    },

    // ── Descripción del pedido (maintenance_orders.description) ────────────
    {
      id: 'description',
      accessorFn: (row) => row.description ?? row.maintenance_requests?.description ?? '',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => {
        const value = row.original.description ?? row.original.maintenance_requests?.description ?? '';
        if (!value) return <span className="text-muted-foreground text-sm">—</span>;
        const truncated = value.length > 60 ? `${value.slice(0, 60)}…` : value;
        return (
          <span className="block max-w-[280px] truncate text-sm" title={value}>
            {truncated}
          </span>
        );
      },
      enableSorting: false,
    },

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

    // ── Fecha de ingreso a taller (workshop_entry_date) ────────────────────
    {
      accessorKey: 'workshop_entry_date',
      id: 'workshop_entry_date',
      meta: { title: 'Ingreso a Taller' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ingreso a Taller" />,
      cell: ({ row }) => {
        const date = row.original.workshop_entry_date;
        return <span>{date ? formatArgentinaDay(date) : '-'}</span>;
      },
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

    // ── Sector actual (calculado desde items, filtrable server-side — ticket 675) ──
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

    // ── Estado (enum status) ───────────────────────────────────────────────
    {
      accessorKey: 'status',
      id: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const status = row.original.status as StatusType;
        const label = statusLabels[status] ?? status ?? 'Sin estado';
        const variant = statusVariants[status] ?? 'default';
        return <Badge variant={variant}>{label}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Progreso (calculado desde work_order_item_repairs) ─────────────────
    {
      id: 'progress',
      accessorFn: (row) => calculateProgress(row).percent,
      meta: { title: 'Progreso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Progreso" />,
      cell: ({ row }) => {
        const { percent } = calculateProgress(row.original);
        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <Progress value={percent} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground">{percent}%</span>
          </div>
        );
      },
      enableSorting: false,
    },

    // ── Fecha creación (created_at) — oculta por defecto ───────────────────
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

    // ── Acciones ───────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: 'Acciones',
      cell: ({ row }) => {
        const order = row.original;
        const canManage = order.status === 'in_workshop' || order.status === 'workshop_rejected';

        if (canManage && onManageOrder) {
          return (
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => onManageOrder(order)} title="Gestionar orden">
                <Settings2 className="h-4 w-4 mr-1" />
                Gestionar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onViewDetail(order)} title="Ver detalle">
                <Eye className="h-4 w-4 mr-1" />
                Detalle
              </Button>
              {onViewItems && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onViewItems(order)} title="Ver ítems solicitados">
                  <Wrench className="h-4 w-4 mr-1" />
                  Ítems
                </Button>
              )}
              <MaintenanceOrderReportButton orderId={order.id} orderNumber={order.order_number} />
            </div>
          );
        }

        return (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onViewDetail(order)} title="Ver detalle">
              <Eye className="h-4 w-4 mr-1" />
              Ver detalle
            </Button>
            {onViewItems && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onViewItems(order)} title="Ver ítems solicitados">
                <Wrench className="h-4 w-4 mr-1" />
                Ítems
              </Button>
            )}
            <MaintenanceOrderReportButton orderId={order.id} orderNumber={order.order_number} />
          </div>
        );
      },
    },
  ];
}
