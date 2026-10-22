'use client';

import { Badge } from '@/components/ui/badge';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { ResourceCell, toResourceCellResource } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { cn } from '@/lib/utils';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { argentinaDate, formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { type ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import moment from 'moment';
import { getResourceLabel } from '../../shared/maintenance-resource';
import type { WorkshopSectorWorkOrderListItem } from './actions.server';
import { WorkOrderTasksDialog } from './components/WorkOrderTasksDialog';
import { MO_STATUS_CONFIG, WO_STATUS_CONFIG } from './work-order-status';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Ticket 678 — una fila = una ORDEN DE TRABAJO (antes era una tarea).
 * Las tareas de cada OT se ven en el modal que abre el N° OT o el botón "Ver".
 */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['started_at', 'created_at'];

// Los mapas de estado viven en `work-order-status.ts` (los comparte el modal de
// tareas). Se re-exportan acá porque son el punto de referencia de labels de
// estado para el resto del módulo.
export { MO_STATUS_CONFIG, WO_STATUS_CONFIG };

/** Labels de los filtros de flags de tarea (a nivel OT: "tiene alguna tarea así") */
export const IS_CRITICAL_LABELS: Record<string, string> = {
  true: 'Con tarea crítica',
  false: 'Sin tareas críticas',
};

export const IS_REJECTED_LABELS: Record<string, string> = {
  true: 'Con tarea rechazada',
  false: 'Sin tareas rechazadas',
};

export const IS_DIAGNOSTICO_LABELS: Record<string, string> = {
  true: 'Con diagnóstico',
  false: 'Sin diagnóstico',
};

/** `planned_end_date` es `@db.Date`: llega como medianoche UTC, así que se compara como texto YYYY-MM-DD con el hoy argentino. */
function isPlannedEndOverdue(plannedEnd: Date): boolean {
  return plannedEnd.toISOString().slice(0, 10) < argentinaDate();
}

// ============================================================================
// COLUMNS
// ============================================================================

export function getWorkshopSectorWorkOrdersColumns(): ColumnDef<WorkshopSectorWorkOrderListItem>[] {
  return [
    // ── N° OT: abre las tareas de la orden ──────────────────────────────────
    {
      id: 'work_order',
      accessorFn: (row) => row.order_number,
      meta: { title: 'N° OT' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° OT" />,
      cell: ({ row }) => (
        <WorkOrderTasksDialog
          workOrderId={row.original.id}
          orderNumber={row.original.order_number}
          status={row.original.status}
          taskCount={row.original.taskCount}
          trigger={
            <button
              type="button"
              aria-label={`Ver las tareas de la orden de trabajo ${row.original.order_number}`}
              className="focus-visible:ring-ring/50 -m-1 rounded-md p-1 text-left font-mono text-sm font-semibold outline-none hover:underline focus-visible:ring-[3px]"
            >
              {row.original.order_number}
            </button>
          }
        />
      ),
    },

    // ── Equipo (vehículo o equipamiento de la OT) ───────────────────────────
    {
      id: 'vehicle',
      accessorFn: (row) => getResourceLabel(row),
      meta: { title: 'Equipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
      cell: ({ row }) => (
        <ResourceCell resource={toResourceCellResource(row.original, row.original.resourceSubtitle)} />
      ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.vehicles?.id ?? row.original.other_equipment?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Estado OT ───────────────────────────────────────────────────────────
    // El estado es de la ORDEN, no de la tarea: la OT está en proceso si alguien
    // ya la inició, sin importar cuántas de sus tareas estén empezadas.
    {
      id: 'wo_status',
      accessorFn: (row) => row.status,
      meta: { title: 'Estado OT' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado OT" />,
      cell: ({ row }) => <MaintenanceStatusPill entity="workOrder" status={row.original.status} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },

    // ── Tareas: completadas / total ─────────────────────────────────────────
    // Se ordena server-side por la cantidad de tareas (ver FK_SORT_MAP). Sin filtro: es un agregado calculado
    // sobre la relación, no una columna de la BD. El export lleva el mismo "2/4".
    {
      id: 'task_count',
      accessorFn: (row) => `${row.completedTaskCount}/${row.taskCount}`,
      meta: { title: 'Tareas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tareas" />,
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.completedTaskCount}/{row.original.taskCount}
          <span className="sr-only"> tareas completadas de {row.original.taskCount}</span>
        </span>
      ),
    },

    // ── Fecha inicio planificada ────────────────────────────────────────────
    {
      accessorKey: 'planned_start_date',
      meta: { title: 'Inicio Plan.' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Inicio Plan." />,
      cell: ({ row }) => (
        <span>
          {row.original.planned_start_date ? (
            moment.utc(row.original.planned_start_date).format('DD/MM/YYYY')
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      ),
    },

    // ── Fecha fin planificada: en rojo y con texto cuando ya pasó (la OT sigue abierta) ──
    {
      accessorKey: 'planned_end_date',
      meta: { title: 'Fin Plan.' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fin Plan." />,
      cell: ({ row }) => {
        const plannedEnd = row.original.planned_end_date;
        if (!plannedEnd) return <span className="text-muted-foreground">—</span>;
        const overdue = isPlannedEndOverdue(plannedEnd);
        return (
          <span className={cn(overdue && 'text-danger-subtle-foreground font-semibold')}>
            {moment.utc(plannedEnd).format('DD/MM/YYYY')}
            {overdue ? <span className="sr-only"> (fuera de plazo)</span> : null}
          </span>
        );
      },
    },

    // ── N° OM + Estado OM (link externo con filtro pre-aplicado) ────────────
    // Una OT sale de una sola OM, pero la relación se recorre por las tareas,
    // así que se contempla el caso de más de una.
    {
      id: 'maintenance_order',
      accessorFn: (row) => row.maintenanceOrders.map((order) => order.order_number ?? order.id).join(', '),
      meta: { title: 'N° OM' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° OM" />,
      cell: ({ row }) => {
        const orders = row.original.maintenanceOrders;
        if (orders.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col gap-1">
            {orders.map((order) => {
              const label = order.order_number ?? order.id.slice(0, 8);
              const href = order.order_number
                ? `/dashboard/maintenance?tab=maint_operaciones&vista=taller&taller_step=in_workshop&maintenance-orders__order_number=${encodeURIComponent(
                    order.order_number
                  )}`
                : null;
              return (
                <div key={order.id} className="flex flex-col gap-1">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {label}
                      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" aria-hidden="true" />
                      <span className="sr-only"> (se abre en una pestaña nueva)</span>
                    </a>
                  ) : (
                    <span className="font-mono text-sm font-medium text-muted-foreground">{label}</span>
                  )}
                  <MaintenanceStatusPill entity="order" status={order.status} size="sm" />
                </div>
              );
            })}
          </div>
        );
      },
    },

    // ── Crítica: la OT tiene alguna tarea crítica (filtro server-side `is_critical`) ──
    {
      id: 'is_critical',
      accessorFn: (row) => (row.hasCriticalTask ? 'Sí' : 'No'),
      meta: { title: 'Crítica' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Crítica" />,
      cell: ({ row }) =>
        row.original.hasCriticalTask ? (
          <Badge variant="destructive">
            <AlertTriangle aria-hidden="true" />
            Sí
          </Badge>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },

    // ── Fecha de inicio real: cuándo entró la unidad al taller (oculta) ─────
    // Se usa `started_at`, no `actual_start_date`: esa última existe en el
    // modelo pero el flujo nunca la escribe.
    {
      accessorKey: 'started_at',
      meta: { title: 'Iniciada el' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Iniciada el" />,
      cell: ({ row }) => (
        <span>
          {row.original.started_at ? (
            formatArgentinaDateTime(row.original.started_at)
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      ),
    },

    // ── Fecha de creación (oculta por defecto) ──────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Creada el' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creada el" />,
      cell: ({ row }) => (
        <span>
          {row.original.created_at ? (
            formatArgentinaDay(row.original.created_at)
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      ),
    },

    // ── Columna virtual: Estado OM (para el filtro facetado mo_status) ──────
    // No visible: el estado de la OM vive dentro de la columna `maintenance_order`.
    {
      id: 'mo_status',
      accessorFn: (row) => row.maintenanceOrders.map((order) => order.status).join(','),
      meta: { title: 'Estado OM', excludeFromExport: true },
      header: () => null,
      cell: () => null,
      enableHiding: false,
      enableSorting: false,
      filterFn: (row, _id, value: string[]) =>
        row.original.maintenanceOrders.some((order) => value.includes(order.status)),
    },

    // ── Columnas virtuales de filtros que describen a las TAREAS de la OT ───
    // La tabla es de OT, pero el taller igual necesita poder acotar por lo que
    // hay adentro. El filtro server-side usa `some` sobre las tareas.
    {
      id: 'repair_type',
      accessorFn: () => null,
      meta: { title: 'Tipo de Reparación', excludeFromExport: true },
      header: () => null,
      cell: () => null,
      enableHiding: false,
      enableSorting: false,
    },
    {
      id: 'is_rejected',
      accessorFn: () => null,
      meta: { title: 'Rechazada', excludeFromExport: true },
      header: () => null,
      cell: () => null,
      enableHiding: false,
      enableSorting: false,
    },
    {
      id: 'is_diagnostico',
      accessorFn: () => null,
      meta: { title: 'Diagnóstico', excludeFromExport: true },
      header: () => null,
      cell: () => null,
      enableHiding: false,
      enableSorting: false,
    },

    // ── Acciones: "Ver" abre el modal con las tareas de la OT ───────────────
    // Solo lectura: la Vista Taller es la tab `workshop_view` con la única acción `view`.
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <WorkOrderTasksDialog
          workOrderId={row.original.id}
          orderNumber={row.original.order_number}
          status={row.original.status}
          taskCount={row.original.taskCount}
        />
      ),
    },
  ];
}

// ============================================================================
// EXPORT FORMATTERS
// ============================================================================

export function getWorkshopSectorWorkOrdersExportFormatters() {
  return {
    // Fechas
    planned_start_date: (val: unknown) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
    planned_end_date: (val: unknown) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
    started_at: (val: unknown) => (val ? formatArgentinaDateTime(val as string) : ''),
    created_at: (val: unknown) => (val ? formatArgentinaDateTime(val as string) : ''),
    // El N° OT se exporta crudo; el estado de la OT sale en su propia columna
    work_order: (val: unknown) => String(val ?? ''),
    // Estado OT (accessorFn retorna el enum crudo → traducir)
    wo_status: (val: unknown) => (val ? WO_STATUS_CONFIG[val as string]?.label ?? String(val) : ''),
    // Estado OM (puede venir más de uno separado por coma)
    mo_status: (val: unknown) =>
      String(val ?? '')
        .split(',')
        .filter(Boolean)
        .map((status) => MO_STATUS_CONFIG[status]?.label ?? status)
        .join(', '),
  };
}
