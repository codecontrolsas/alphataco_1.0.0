'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OrderDetailDialog } from '@/features/Mantenimiento/MaintenanceOrders/components/OrderDetailDialog';
import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import { ATTENTION_THRESHOLDS } from '@/features/Mantenimiento/lib/attention-thresholds';
import { RelativeAge } from '@/features/Mantenimiento/shared/components/RelativeAge';
import { ResourceCell, toResourceCellResource } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { calculateRepairProgress } from '@/features/Mantenimiento/utils/repairProgress';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { DataTable } from '@/shared/components/common/DataTable';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, Clock, Eye } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { getResourceLabel } from '../../shared/maintenance-resource';
import type { ValidationOrdersData } from '../actions/actionsServer';

// ============================================================================
// TYPES
// ============================================================================

export type ValidationOrder = ValidationOrdersData[number];

// ============================================================================
// HELPERS
// ============================================================================

function getSectors(order: ValidationOrder): string[] {
  const items = order.maintenance_order_items ?? [];
  const names = items.map((item) => item.workshop_sectors?.name).filter(Boolean) as string[];
  return [...new Set(names)];
}

/** Ticket 596: la orden puede ser de un vehiculo o de un equipamiento */
function getVehicleLabel(order: ValidationOrder): string {
  return getResourceLabel(order);
}

// ============================================================================
// HISTORY CELL
// ============================================================================

function HistoryCell({ maintenanceOrderId, orderNumber }: { maintenanceOrderId: string; orderNumber: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="Ver historial"
        aria-label="Ver historial de la orden"
      >
        <Clock className="h-4 w-4" aria-hidden="true" />
      </Button>
      <ActivityHistoryModal
        open={open}
        onClose={() => setOpen(false)}
        maintenanceOrderId={maintenanceOrderId}
        title={`Historial de OM ${orderNumber ?? ''}`}
      />
    </>
  );
}

// ============================================================================
// TABLE ID
// ============================================================================

/** `-v2`: columnas nuevas, así no se hereda la visibilidad guardada de la tabla anterior. */
const TABLE_ID = 'approval-validation-orders-v2';
const PARAM_NAMESPACE = 'approval-validation-orders';

// ============================================================================
// INNER TABLE COMPONENT (tipado correcto via genérico)
// ============================================================================

/**
 * Componente interno tipado para evitar casts problemáticos.
 * DataTable requiere TData extends Record<string, unknown> — ValidationOrder lo cumple.
 */
function ValidationOrdersTable({
  data,
  canClose,
  onViewDetail,
}: {
  data: ValidationOrder[];
  /** `ordenes_mantenimiento:update`: sin él la fila solo permite ver la orden. */
  canClose: boolean;
  onViewDetail: (order: ValidationOrder) => void;
}) {
  const columns: ColumnDef<ValidationOrder>[] = useMemo(
    () => [
      // ── N° Orden ───────────────────────────────────────────────────────────
      {
        accessorKey: 'order_number',
        id: 'order_number',
        meta: { title: 'N° Orden' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="N° Orden" />,
        cell: ({ row }) =>
          row.original.order_number ? (
            <span className="font-mono text-sm font-medium">{row.original.order_number}</span>
          ) : (
            <span className="text-muted-foreground text-sm">Se asigna al ingresar</span>
          ),
      },

      // ── Equipo / Vehículo ─────────────────────────────────────────────────
      {
        id: 'vehicle',
        accessorFn: (row) => getVehicleLabel(row),
        meta: { title: 'Equipo' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
        cell: ({ row }) => <ResourceCell resource={toResourceCellResource(row.original)} />,
        enableSorting: false,
      },

      // ── Descripción del pedido ────────────────────────────────────────────
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

      // ── Sectores (calculado desde items) ──────────────────────────────────
      {
        id: 'sectors',
        accessorFn: (row) => getSectors(row).join(', '),
        meta: { title: 'Sectores' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sectores" />,
        cell: ({ row }) => {
          const sectorList = getSectors(row.original);
          if (sectorList.length === 0) return <Badge variant="outline">Sin asignar</Badge>;
          return (
            <div className="flex flex-wrap gap-1">
              {sectorList.map((name) => (
                <Badge key={name} variant="secondary" className="text-[10px]">
                  {name}
                </Badge>
              ))}
            </div>
          );
        },
        enableSorting: false,
      },

      // ── Progreso ──────────────────────────────────────────────────────────
      {
        id: 'progress',
        accessorFn: (row) => calculateRepairProgress(row.maintenance_order_items).percent,
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

      // ── Fecha ingreso a taller ────────────────────────────────────────────
      {
        accessorKey: 'workshop_entry_date',
        id: 'workshop_entry_date',
        meta: { title: 'Ingreso a Taller' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ingreso a Taller" />,
        cell: ({ row }) => {
          const date = row.original.workshop_entry_date;
          return date ? (
            <RelativeAge value={date} thresholdDays={ATTENTION_THRESHOLDS.inWorkshopDays} />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          );
        },
      },

      // ── Historial ─────────────────────────────────────────────────────────
      {
        id: 'history',
        meta: { title: '', excludeFromExport: true },
        enableSorting: false,
        enableHiding: false,
        header: '',
        cell: ({ row }) => <HistoryCell maintenanceOrderId={row.original.id} orderNumber={row.original.order_number} />,
      },

      // ── Acciones ──────────────────────────────────────────────────────────
      {
        id: 'actions',
        meta: { title: '', excludeFromExport: true },
        enableSorting: false,
        enableHiding: false,
        header: 'Acciones',
        cell: ({ row }) => (
          <Button
            type="button"
            variant={canClose ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewDetail(row.original)}
            title={canClose ? 'Ver detalle y validar orden' : 'Ver detalle de la orden'}
          >
            {canClose ? (
              <ClipboardCheck className="h-4 w-4 mr-1" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4 mr-1" aria-hidden="true" />
            )}
            {canClose ? 'Revisar y cerrar' : 'Ver orden'}
          </Button>
        ),
      },
    ],
    [canClose, onViewDetail]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={data.length}
      searchParams={{}}
      paramNamespace={PARAM_NAMESPACE}
      tableId={TABLE_ID}
      inMemory
      mobileCards
      searchPlaceholder="Buscar por N° orden o equipo..."
      emptyMessage="No hay órdenes pendientes de validación"
      showFilterToggle={false}
      showColumnToggle={false}
      showSearch={false}
    />
  );
}

// ============================================================================
// PUBLIC COMPONENT
// ============================================================================

interface Props {
  validationOrders: ValidationOrdersData;
}

export function _ValidationOrdersDataTable({ validationOrders }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { hasPermission } = usePermissions();
  const canClose = hasPermission('mantenimiento', 'ordenes_mantenimiento', 'update');

  const handleViewDetail = useCallback((order: ValidationOrder) => {
    setSelectedOrderId(order.id);
  }, []);

  return (
    <>
      <ValidationOrdersTable data={validationOrders} canClose={canClose} onViewDetail={handleViewDetail} />

      <OrderDetailDialog
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        context="workshop"
      />
    </>
  );
}
