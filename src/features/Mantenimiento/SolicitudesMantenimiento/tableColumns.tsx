'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ATTENTION_THRESHOLDS } from '@/features/Mantenimiento/lib/attention-thresholds';
import {
  LEGACY_HISTORY_LABELS,
  ORDER_STATUS_UI,
  REQUEST_STATUS_UI,
} from '@/features/Mantenimiento/lib/status-presentation';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { RelativeAge } from '@/features/Mantenimiento/shared/components/RelativeAge';
import { ResourceCell, toResourceCellResource } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { getResourceLabel } from '@/features/Mantenimiento/shared/maintenance-resource';
import { resolveDriverInfo } from '@/features/Mantenimiento/utils/driverInfo';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Eye, History, MoreHorizontal, UserRoundCog, XCircle, type LucideIcon } from 'lucide-react';
import type { MaintenanceRequestListItem } from './actions/actionsTableServer';

// ============================================================================
// CONSTANTES DE STATUS (derivadas de la fuente única `status-presentation`)
// ============================================================================

export const REQUEST_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(REQUEST_STATUS_UI).map(([status, ui]) => [status, ui.label])
);

/**
 * Estados de la orden que puede mostrar una solicitud ya aprobada. `date_rejected` es un estado histórico
 * (ya no es un valor vigente de la orden) y se conserva solo para leer solicitudes viejas.
 */
const SOLICITUD_ORDER_STATUSES = [
  'pending_scheduling',
  'scheduled',
  'date_confirmed',
  'in_workshop',
  'completed',
  'rejected',
] as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  ...Object.fromEntries(SOLICITUD_ORDER_STATUSES.map((status) => [status, ORDER_STATUS_UI[status].label])),
  date_rejected: LEGACY_HISTORY_LABELS.date_rejected,
};

export const SOURCE_LABELS: Record<string, string> = {
  checklist: 'Checklist',
  manual: 'Manual',
  preventive: 'Preventivo',
};

export const STATUS_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(REQUEST_STATUS_UI).map(([status, ui]) => [status, ui.icon])
);

// ============================================================================
// COLUMNAS OCULTAS POR DEFECTO
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['kilometer', 'engine_hours'];

// ============================================================================
// HELPERS DE CELDA
// ============================================================================

type RequestRow = MaintenanceRequestListItem;

/** Subtítulo del equipo: tipo del vehículo o subtipo (o tipo) del equipamiento. */
function resourceSubtitle(row: RequestRow): string | null {
  if (row.vehicles) return row.vehicles.type_vehicles_typeTotype?.name ?? null;
  if (row.other_equipment) return row.other_equipment.sub_type?.name ?? row.other_equipment.type?.name ?? null;
  return null;
}

/** Chofer como "Apellido Nombre" (misma prioridad de fuentes que `resolveDriverInfo`) o el texto libre del checklist. */
function driverDisplayName(row: RequestRow): string {
  if (row.driver_employee) return `${row.driver_employee.lastname} ${row.driver_employee.firstname}`.trim();
  return resolveDriverInfo(row).name;
}

function criticalCount(row: RequestRow): number {
  return row.maintenance_request_items.filter((item) => item.checklist_deviations?.is_critical === true).length;
}

// ============================================================================
// PROPS DE COLUMNAS
// ============================================================================

interface ColumnsProps {
  onView: (request: MaintenanceRequestListItem) => void;
  onApprove: (request: MaintenanceRequestListItem) => void;
  onReject: (request: MaintenanceRequestListItem) => void;
  onViewHistory: (request: MaintenanceRequestListItem) => void;
  onReassign?: (request: MaintenanceRequestListItem) => void;
  /** Validar / rechazar / reasignar exigen `mantenimiento:maintenance_requests:update` (lo verifica también el servidor). */
  canApproveReject?: boolean;
}

// ============================================================================
// FUNCIÓN DE COLUMNAS
// ============================================================================

export function getMaintenanceRequestColumns({
  onView,
  onApprove,
  onReject,
  onViewHistory,
  onReassign,
  canApproveReject = false,
}: ColumnsProps): ColumnDef<MaintenanceRequestListItem>[] {
  return [
    // Equipo (vehículo o equipamiento, excluyentes). La celda es un botón que abre el detalle.
    {
      id: 'vehicle',
      accessorFn: (row) => getResourceLabel(row),
      ...titled('Equipo'),
      cell: ({ row }) => {
        const request = row.original;
        if (!request.vehicles && !request.other_equipment) return <span className="text-muted-foreground">-</span>;
        return (
          <button
            type="button"
            onClick={() => onView(request)}
            aria-label={`Ver detalle de la solicitud de ${getResourceLabel(request)}`}
            className="focus-visible:ring-ring/50 -m-1 max-w-full rounded-md p-1 text-left outline-none focus-visible:ring-[3px]"
          >
            <ResourceCell resource={toResourceCellResource(request, resourceSubtitle(request))} />
          </button>
        );
      },
      // El filtro facetado de "Equipo" solo cubre vehículos (equipment_id). Las solicitudes de
      // other_equipment quedan fuera de este filtro por ahora — alcance no incluido en el ticket 673.
      filterFn: (row, _id, value: string[]) => {
        const vehicleId = row.original.vehicles?.id;
        if (!vehicleId) return value.includes(NULL_FILTER_VALUE);
        return value.includes(vehicleId);
      },
      enableSorting: true,
    },

    // Fecha de la solicitud con su antigüedad: pasadas las 48 h sin validar se marca en rojo
    {
      id: 'created_at',
      accessorKey: 'created_at',
      ...titled('Fecha Solicitud'),
      cell: ({ row }) => {
        const date = row.original.created_at;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return (
          <span title={formatArgentinaDateTime(date)}>
            <RelativeAge value={date} thresholdHours={ATTENTION_THRESHOLDS.requestPendingHours} />
          </span>
        );
      },
      enableSorting: true,
    },

    // Desvíos, con cuántos son críticos (el texto acompaña al ícono: nunca solo color)
    {
      id: 'items_count',
      accessorFn: (row) => row.maintenance_request_items?.length ?? 0,
      ...titled('Desvíos'),
      cell: ({ row }) => {
        const total = row.original.maintenance_request_items.length;
        const critical = criticalCount(row.original);
        return (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="font-mono text-sm font-medium tabular-nums">
              {total}{' '}
              <span className="text-muted-foreground font-sans text-xs">{total === 1 ? 'desvío' : 'desvíos'}</span>
            </span>
            {critical > 0 ? (
              <span className="text-danger-subtle-foreground inline-flex items-center gap-1 text-xs font-semibold">
                <AlertTriangle className="size-3" aria-hidden="true" />
                {critical} {critical === 1 ? 'crítico' : 'críticos'}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">sin críticos</span>
            )}
          </div>
        );
      },
      enableSorting: true,
    },

    // Legajo del chofer — columna separada ANTES del nombre (regla de proyecto: el legajo
    // identifica unívocamente al empleado, el nombre puede repetirse). Cascada: driver_employee
    // (FK nueva) → employees (FK vieja). El chofer legacy vía JSON no tiene legajo asociado.
    {
      id: 'fileNumber',
      accessorFn: (row) => resolveDriverInfo(row).fileNumber ?? '',
      ...titled('Legajo'),
      cell: ({ row }) => {
        const fileNumber = resolveDriverInfo(row.original).fileNumber;
        if (!fileNumber) return <span className="text-muted-foreground">-</span>;
        return <span className="font-mono text-sm tabular-nums">{fileNumber}</span>;
      },
      enableSorting: true,
    },

    // Chofer
    {
      id: 'driver',
      accessorFn: (row) => resolveDriverInfo(row).name,
      ...titled('Chofer'),
      cell: ({ row }) => {
        const name = driverDisplayName(row.original);
        if (!name || name === 'No especificado') return <span className="text-muted-foreground">-</span>;
        return (
          <span className="block max-w-[200px] truncate text-sm" title={name}>
            {name}
          </span>
        );
      },
      enableSorting: true,
    },

    // Supervisor: "[legajo] Nombre" cuando su perfil está vinculado a un empleado
    {
      id: 'supervisor',
      accessorFn: (row) => row.profile_maintenance_requests_supervisor_idToprofile?.fullname || '',
      ...titled('Supervisor'),
      cell: ({ row }) => {
        const supervisor = row.original.profile_maintenance_requests_supervisor_idToprofile;
        if (!supervisor) return <span className="text-muted-foreground">Sin asignar</span>;
        const label = supervisor.employees?.file
          ? `[${supervisor.employees.file}] ${supervisor.fullname ?? ''}`.trim()
          : supervisor.fullname ?? 'Sin nombre';
        return (
          <span className="block max-w-[200px] truncate text-sm" title={label}>
            {label}
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const supervisorId = row.original.supervisor_id;
        if (!supervisorId) return value.includes(NULL_FILTER_VALUE);
        return value.includes(supervisorId);
      },
      enableSorting: true,
    },

    // Origen (checklist / manual / preventivo)
    {
      id: 'source',
      accessorKey: 'source',
      ...titled('Origen'),
      cell: ({ row }) => {
        const source = row.original.source;
        if (!source) return <span className="text-muted-foreground">-</span>;
        return <span className="text-sm">{SOURCE_LABELS[source] ?? source}</span>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      enableSorting: true,
    },

    // Kilometraje (oculta por defecto)
    {
      id: 'kilometer',
      accessorKey: 'kilometer',
      ...titled('Kilometraje'),
      cell: ({ row }) => {
        const km = row.original.kilometer;
        if (!km) return <span className="text-muted-foreground">-</span>;
        return <span className="font-mono text-sm tabular-nums">{km} km</span>;
      },
      enableSorting: true,
    },

    // Horas de motor (oculta por defecto)
    {
      id: 'engine_hours',
      accessorKey: 'engine_hours',
      ...titled('Horas Motor'),
      cell: ({ row }) => {
        const hours = row.original.engine_hours;
        if (!hours) return <span className="text-muted-foreground">-</span>;
        return <span className="font-mono text-sm tabular-nums">{hours} hs</span>;
      },
      enableSorting: true,
    },

    // Estado (con lógica dual: aprobada → estado del pedido; si no → estado de la solicitud)
    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => {
        const status = row.original.status;
        const orderStatus = row.original.maintenance_orders?.[0]?.status;

        // Si la solicitud está aprobada, mostrar el estado del pedido de mantenimiento
        if (status === 'approved' && orderStatus) return <MaintenanceStatusPill entity="order" status={orderStatus} />;
        return <MaintenanceStatusPill entity="request" status={status} />;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      enableSorting: true,
    },

    // Acciones: la principal (Validar) a la vista y el resto en el menú ⋯
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      header: '',
      cell: ({ row }) => {
        const request = row.original;
        const canResolve = request.status === 'pending_approval' && canApproveReject;
        const label = getResourceLabel(request);

        return (
          <div className="flex items-center justify-end gap-1">
            {canResolve ? (
              <Button
                type="button"
                size="sm"
                onClick={() => onApprove(request)}
                aria-label={`Validar la solicitud de ${label}`}
              >
                Validar
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onView(request)}
                aria-label={`Ver detalle de la solicitud de ${label}`}
              >
                <Eye aria-hidden="true" />
                Ver
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Más acciones para la solicitud de ${label}`}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(request)}>
                  <Eye aria-hidden="true" />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onViewHistory(request)}>
                  <History aria-hidden="true" />
                  Ver historial
                </DropdownMenuItem>
                {canResolve ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => onReject(request)}>
                      <XCircle aria-hidden="true" />
                      Rechazar
                    </DropdownMenuItem>
                    {onReassign ? (
                      <DropdownMenuItem onSelect={() => onReassign(request)}>
                        <UserRoundCog aria-hidden="true" />
                        Reasignar supervisor
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
