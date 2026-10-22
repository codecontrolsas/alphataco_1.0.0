'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, enumFilterOptions } from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { conditionLabels } from '@/shared/utils/mappers';
import { useCallback, useMemo, useState } from 'react';
import { unwrapExportWithToast } from '../lib/export-client';
import {
  VEHICLE_TEXT_FILTERS,
  conditionIcons,
  getVehicleDialogColumns,
  vehicleExportFormatters,
  type VehicleDialogItem,
} from './vehicleDialogShared';

interface VehicleListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Apariencia del badge de condición. */
  conditionVariant: 'success' | 'destructive';
  /** Condiciones que entran al listado (las mismas que filtra la action). */
  allowedConditions: readonly string[];
  /** Estas funciones deben tener referencia estable (`useCallback` en quien las pasa). */
  fetchPage: (params: DataTableSearchParams) => Promise<{ data: VehicleDialogItem[]; total: number }>;
  fetchFacet: (columnId: string, params: DataTableSearchParams) => Promise<SingleFacetResult>;
  fetchExport: (params: DataTableSearchParams) => Promise<ExportResult<VehicleDialogItem[]>>;
  queryKey: readonly unknown[];
  exportOptions: { filename: string; sheetName: string; title: string };
  emptyMessage: string;
  paramNamespace: string;
}

/** Diálogo con la tabla de equipos del tablero (disponibles y fuera de servicio comparten todo salvo la consulta). */
export default function VehicleListDialog({
  open,
  onOpenChange,
  title,
  description,
  conditionVariant,
  allowedConditions,
  fetchPage,
  fetchFacet,
  fetchExport,
  queryKey,
  exportOptions,
  emptyMessage,
  paramNamespace,
}: VehicleListDialogProps) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const columns = useMemo(() => getVehicleDialogColumns(conditionVariant), [conditionVariant]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const facets = createFacetFilters(fetchFacet);
    return [
      ...VEHICLE_TEXT_FILTERS,
      facets.lookup('vehicleType', 'Tipo', undefined, { label: 'Sin asignar' }),
      facets.lookup('subType', 'Subtipo', undefined, { label: 'Sin asignar' }),
      facets.fixed('condition', 'Condición', enumFilterOptions(allowedConditions, conditionLabels, conditionIcons)),
      facets.lookup('contractor_equipment', 'Afectaciones', undefined, { label: 'Sin afectar' }),
    ];
  }, [fetchFacet, allowedConditions]);

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
      fetchAllData: async () => unwrapExportWithToast(await fetchExport(currentParams)),
      options: exportOptions,
      formatters: vehicleExportFormatters,
    }),
    [currentParams, fetchExport, exportOptions]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <DataTable
            columns={columns}
            data={[]}
            totalRows={0}
            queryFn={fetchPage}
            queryKey={[...queryKey]}
            onStateChange={handleStateChange}
            facetedFilters={facetedFilters}
            initialFilterVisibility={initialFilterVisibility}
            exportConfig={exportConfig}
            searchPlaceholder="Buscar por dominio, serie, N° interno..."
            showSearch
            showFilterToggle
            showColumnToggle
            emptyMessage={emptyMessage}
            paramNamespace={paramNamespace}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
