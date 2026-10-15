'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ORDER_STATUS_FILTER_ORDER, ORDER_STATUS_UI } from '@/features/Mantenimiento/lib/status-presentation';
import { DataTable, type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import {
  getMaintenanceOrdersForOtherEquipment,
  type OtherEquipmentMaintenanceOrder,
  type OtherEquipmentMaintenanceOrders,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getOtherEquipmentMaintenanceColumns } from './columns';

// DataTable requiere TData extends Record<string, unknown>.
type MaintenanceOrderRecord = OtherEquipmentMaintenanceOrder & Record<string, unknown>;

interface OtherEquipmentMaintenanceTableProps {
  equipmentId: string;
  initialData?: OtherEquipmentMaintenanceOrders;
}

/**
 * Tab "Mantenimiento" del legajo de un equipamiento (ticket 596).
 *
 * Tabla chica (todo el historial de un solo equipamiento): sin paginación
 * server-side ni facets lazy-load — se resuelve en memoria (`inMemory`).
 */
export function OtherEquipmentMaintenanceTable({ equipmentId, initialData }: OtherEquipmentMaintenanceTableProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['other-equipment-maintenance-orders', equipmentId],
    queryFn: () => getMaintenanceOrdersForOtherEquipment(equipmentId),
    initialData,
    staleTime: 5 * 60 * 1000,
  });

  const rows = useMemo(() => (data ?? []) as MaintenanceOrderRecord[], [data]);
  const columns = useMemo(() => getOtherEquipmentMaintenanceColumns() as ColumnDef<MaintenanceOrderRecord>[], []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const statusOptions = ORDER_STATUS_FILTER_ORDER.map((value) => ({
      value,
      label: ORDER_STATUS_UI[value].label,
      icon: ORDER_STATUS_UI[value].icon,
    }));
    // Solo se ofrecen los estados presentes: un filtro con opciones que siempre
    // dan cero es ruido en el historial de un único equipamiento.
    const present = new Set(rows.map((r) => r.status).filter(Boolean));
    return [
      {
        columnId: 'status',
        title: 'Estado',
        options: statusOptions.filter((o) => present.has(o.value)),
      },
      {
        columnId: 'source',
        title: 'Origen',
        options: [
          { value: 'checklist', label: 'Checklist' },
          { value: 'preventive', label: 'Preventivo' },
          { value: 'manual', label: 'Carga manual' },
        ],
      },
    ];
  }, [rows]);

  const initialColumnVisibility = useMemo(
    () => Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((columnId) => [columnId, false])),
    []
  );

  // ── Carga: skeleton estructural, no un spinner mudo ────────────────────────
  if (isLoading || (isFetching && rows.length === 0 && !isError)) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-10 w-full" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // ── Error: nunca cae en el vacío ───────────────────────────────────────────
  // Sin esta rama, un fallo de carga se mostraría como "sin mantenimientos",
  // afirmando algo que no se pudo verificar.
  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertTriangle aria-hidden="true" className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">No se pudo cargar el historial de mantenimiento.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Vacío real: la consulta salió bien y no hay órdenes ────────────────────
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Wrench aria-hidden="true" className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">Sin órdenes de mantenimiento</p>
          <p className="max-w-md text-sm text-muted-foreground text-pretty">
            Acá vas a ver las órdenes de este equipamiento. Se generan desde Mantenimiento → Nuevo Pedido, eligiendo el
            camino Equipamientos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={rows}
            totalRows={rows.length}
            searchParams={{}}
            inMemory
            paramNamespace="oe-maint"
            tableId="other-equipment-maintenance"
            facetedFilters={facetedFilters}
            initialColumnVisibility={initialColumnVisibility}
            searchPlaceholder="Buscar por N° de orden…"
            showFilterToggle
            emptyMessage="Sin resultados para los filtros aplicados"
          />
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
