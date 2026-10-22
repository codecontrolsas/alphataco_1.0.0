'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { useCallback, useMemo, useState } from 'react';
import {
  getAvailableVehicleSingleFacet,
  getAvailableVehiclesForExport,
  getAvailableVehiclesPaginated,
} from '../actions/fleet.server';
import { unwrapExportWithToast } from '../lib/export-client';
import {
  VEHICLE_TEXT_FILTERS,
  buildConditionFacetResult,
  buildFkFacetResult,
  getVehicleDialogColumns,
  vehicleExportFormatters,
} from './vehicleDialogShared';

/** Condiciones que entran al listado de disponibles (las mismas que filtra la action). */
const AVAILABLE_CONDITIONS = ['operativo', 'operativo_condicionado'] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  typeIds?: string[];
}

export default function AvailableVehiclesDialog({ open, onOpenChange, count, typeIds }: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn paginado — apunta directo a Prisma server-side
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getAvailableVehiclesPaginated(params, typeIds),
    [typeIds]
  );

  const columns = useMemo(() => getVehicleDialogColumns('success'), []);

  // Factory para facets FK con lazy-load
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getAvailableVehicleSingleFacet(columnId, typeIds, params);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
      };
    },
    [typeIds]
  );

  const fetchConditionFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getAvailableVehicleSingleFacet('condition', typeIds, params);
      return buildConditionFacetResult(AVAILABLE_CONDITIONS, result?.counts ?? new Map());
    },
    [typeIds]
  );

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
      fetchAllData: async () => unwrapExportWithToast(await getAvailableVehiclesForExport(currentParams, typeIds)),
      options: {
        filename: 'vehiculos-disponibles-sin-asignar',
        sheetName: 'Disponible - Sin asignar',
        title: 'Disponible - Sin asignar',
      },
      formatters: vehicleExportFormatters,
    }),
    [currentParams, typeIds]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Disponible / Sin asignar ({count})</DialogTitle>
          <DialogDescription>
            Equipos con condición operativa u operativa condicionada que no están en el parte diario de hoy. La cifra
            del título es operativos − en operaciones; si difiere del total de la tabla, cuenta equipos con otra
            condición.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <DataTable
            columns={columns}
            data={[]}
            totalRows={0}
            queryFn={tableQueryFn}
            queryKey={['dashboard-available-vehicles', ...(typeIds ?? [])]}
            onStateChange={handleStateChange}
            facetedFilters={facetedFilters}
            initialFilterVisibility={initialFilterVisibility}
            exportConfig={exportConfig}
            searchPlaceholder="Buscar por dominio, serie, N° interno..."
            showSearch
            showFilterToggle
            showColumnToggle
            emptyMessage="No hay equipos disponibles"
            paramNamespace="veh-avail-dialog"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
