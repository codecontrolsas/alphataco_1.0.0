'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { useCallback, useMemo, useState } from 'react';
import {
  getRepairVehicleSingleFacet,
  getRepairVehiclesForExport,
  getRepairVehiclesPaginated,
} from '../actions/fleet.server';
import { unwrapExportWithToast } from '../lib/export-client';
import {
  VEHICLE_TEXT_FILTERS,
  buildConditionFacetResult,
  buildFkFacetResult,
  getVehicleDialogColumns,
  vehicleExportFormatters,
} from './vehicleDialogShared';

/** Condiciones que entran al listado de fuera de servicio (las mismas que filtra la action). */
const OUT_OF_SERVICE_CONDITIONS = ['no_operativo', 'en_reparacion', 'en_preparacion'] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
}

export default function VehiclesOnRepairDialog({ open, onOpenChange, count }: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn paginado — apunta directo a Prisma server-side
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getRepairVehiclesPaginated(params), []);

  const columns = useMemo(() => getVehicleDialogColumns('destructive'), []);

  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar') => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getRepairVehicleSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
    };
  }, []);

  const fetchConditionFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getRepairVehicleSingleFacet('condition', params);
    return buildConditionFacetResult(OUT_OF_SERVICE_CONDITIONS, result?.counts ?? new Map());
  }, []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      ...VEHICLE_TEXT_FILTERS,
      { columnId: 'vehicleType', title: 'Tipo', fetchFacet: makeFkFetchFacet('vehicleType') },
      { columnId: 'subType', title: 'Subtipo', fetchFacet: makeFkFetchFacet('subType') },
      { columnId: 'condition', title: 'Condición', fetchFacet: fetchConditionFacet },
      {
        columnId: 'contractor_equipment',
        title: 'Afectaciones',
        fetchFacet: makeFkFetchFacet('contractor_equipment', 'Sin afectar'),
      },
    ],
    [makeFkFetchFacet, fetchConditionFacet]
  );

  // Sólo 3 filtros a la vista; el resto se activa con el botón de filtros.
  const initialFilterVisibility = useMemo(
    () =>
      Object.fromEntries(
        facetedFilters.map((f) => [
          f.columnId,
          ['vehicleType', 'condition', 'contractor_equipment'].includes(f.columnId),
        ])
      ),
    [facetedFilters]
  );

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportWithToast(await getRepairVehiclesForExport(currentParams)),
      options: {
        filename: 'vehiculos-fuera-de-servicio',
        sheetName: 'Fuera de servicio',
        title: 'Equipos fuera de servicio',
      },
      formatters: vehicleExportFormatters,
    }),
    [currentParams]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Equipos fuera de servicio ({count})</DialogTitle>
          <DialogDescription>
            Equipos activos con condición no operativo, en reparación o en preparación.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <DataTable
            columns={columns}
            data={[]}
            totalRows={0}
            queryFn={tableQueryFn}
            queryKey={['dashboard-repair-vehicles']}
            onStateChange={handleStateChange}
            facetedFilters={facetedFilters}
            initialFilterVisibility={initialFilterVisibility}
            exportConfig={exportConfig}
            searchPlaceholder="Buscar por dominio, serie, N° interno..."
            showSearch
            showFilterToggle
            showColumnToggle
            emptyMessage="No hay equipos fuera de servicio"
            paramNamespace="veh-repair-dialog"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
