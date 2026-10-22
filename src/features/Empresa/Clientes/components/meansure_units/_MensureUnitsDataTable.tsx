'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Logger } from '@/lib/logger';
import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteMeasureUnit,
  getAllMeasureUnitsForExport,
  getMeasureUnitSingleFacet,
  getMeasureUnitsPaginated,
  type MeasureUnitListItem,
} from '../../actions/measure-units.server';
import MensureUnitsForm from './MensureUnitsForm';
import { getColumns } from './columns';
import { MEASURE_UNITS_QUERY_KEY } from './constants';

const logger = new Logger('features/Empresa/Clientes/MensureUnitsDataTable');

const DEFAULT_VISIBLE_FILTERS = ['simbol', 'unit', 'tipo'];

interface MensureUnitsDataTableProps {
  data: MeasureUnitListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Mapa plano del servidor: "modulo:tab:accion" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

export default function _MensureUnitsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: MensureUnitsDataTableProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [unitToDelete, setUnitToDelete] = useState<MeasureUnitListItem | null>(null);

  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );
  const canCreate = permissions.hasPermission('comercial', 'mensure_units', 'create');
  const canUpdate = permissions.hasPermission('comercial', 'mensure_units', 'update');

  const sheet = useCatalogSheet<MeasureUnitListItem>({ canCreate, canUpdate });

  // ── Client-side navigation mode ──
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getMeasureUnitsPaginated(params), []);

  const columns = useMemo(
    () => getColumns(permissions, sheet.openEdit, setUnitToDelete),
    [permissions, sheet.openEdit]
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(DEFAULT_VISIBLE_FILTERS.map((id) => [id, true]));
  }, [initialFilterVisibility]);

  const fetchTipoFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getMeasureUnitSingleFacet('tipo', params);
    return result ?? { options: [], counts: new Map() };
  }, []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'simbol', title: 'Símbolo', type: 'text' as const, placeholder: 'Buscar por símbolo...' },
      { columnId: 'unit', title: 'Unidad', type: 'text' as const, placeholder: 'Buscar por unidad...' },
      { columnId: 'tipo', title: 'Tipo', fetchFacet: fetchTipoFacet },
    ],
    [fetchTipoFacet]
  );

  const refreshAfterMutation = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: MEASURE_UNITS_QUERY_KEY });
    // Contratos lee el catálogo desde el servidor: refrescar para que no quede viejo.
    router.refresh();
  }, [queryClient, router]);

  const handleConfirmDelete = async () => {
    if (!unitToDelete) return;
    try {
      const result = await deleteMeasureUnit(unitToDelete.id);
      if (result.ok) {
        toast.success('Unidad de medida eliminada correctamente');
        refreshAfterMutation();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      logger.error('Error al eliminar la unidad de medida', { data: { error } });
      toast.error('Error al eliminar la unidad de medida');
    } finally {
      setUnitToDelete(null);
    }
  };

  return (
    <>
      <CatalogTableSurface>
        <DataTable
          columns={columns}
          data={data}
          totalRows={totalRows}
          searchParams={searchParams}
          queryFn={tableQueryFn}
          queryKey={MEASURE_UNITS_QUERY_KEY}
          onStateChange={handleStateChange}
          toolbarActions={<CatalogCreateButton sheet={sheet} label="Nueva unidad" />}
          tableId={tableId}
          paramNamespace={tableId}
          facetedFilters={facetedFilters}
          initialColumnVisibility={initialColumnVisibility ?? {}}
          initialFilterVisibility={mergedFilterVisibility}
          showFilterToggle
          searchPlaceholder="Buscar por símbolo, unidad o tipo..."
          emptyMessage="No se encontraron unidades de medida"
          exportConfig={{
            fetchAllData: async () => unwrapExportResult(await getAllMeasureUnitsForExport(currentParams)),
            options: {
              filename: 'unidades-de-medida',
              sheetName: 'Unidades de Medida',
              title: 'Unidades de Medida',
            },
          }}
        />
      </CatalogTableSurface>

      <CatalogFormSheet
        sheet={sheet}
        getKey={(unit) => unit.id}
        title={{ create: 'Nueva unidad de medida', edit: 'Editar unidad de medida' }}
        size="md"
      >
        {({ mode, item }) => <MensureUnitsForm mode={mode} unit={item} onSaved={refreshAfterMutation} />}
      </CatalogFormSheet>

      <AlertDialog open={!!unitToDelete} onOpenChange={(open) => !open && setUnitToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar unidad de medida</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro de que desea eliminar la unidad {unitToDelete?.simbol}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
