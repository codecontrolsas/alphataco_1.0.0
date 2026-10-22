'use client';

import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import {
  getAllContractTypesForExport,
  getContractTypeSingleFacet,
  getContractTypesPaginated,
  type ContractTypeListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';
import ContractTypeForm from './components/ContractTypeForm';
import { useContractTypeStore } from './store/contractType.store';

// ============================================================================
// TYPES
// ============================================================================

interface ContractTypeDataTableProps {
  data: ContractTypeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _ContractTypeDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: ContractTypeDataTableProps) {
  // ── Permisos: construir helper desde el map serializable del servidor ────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('configuracion', 'contract-types', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'contract-types', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el store de edición) ─────
  const setContractType = useContractTypeStore((state) => state.setContractType);
  const handleClearStore = useCallback(() => setContractType(null), [setContractType]);
  const sheet = useCatalogSheet<ContractTypeListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setContractType,
    onOpenCreate: handleClearStore,
    onClosed: handleClearStore,
  });
  const handleEdit = sheet.openEdit;

  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getContractTypesPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions, handleEdit), [permissions, handleEdit]);

  // ── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...(initialColumnVisibility ?? {}) };
  }, [initialColumnVisibility]);

  // ── Filter visibility — 3 visibles por defecto ────────────────────────────
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'description'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['name', 'description', 'is_active', 'created_at'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getContractTypeSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  // ── Faceted filters ───────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── is_active (booleano nullable) ──────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: fetchIsActiveFacet,
      },

      // ── name (texto libre) ─────────────────────────────────────────────────
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },

      // ── description (texto libre) ──────────────────────────────────────────
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Buscar por descripción...',
      },

      // ── created_at (rango de fechas) ───────────────────────────────────────
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    [fetchIsActiveFacet]
  );

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['contract-types']}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo tipo de contrato" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      searchPlaceholder="Buscar tipos de contrato..."
      emptyMessage="No se encontraron tipos de contrato"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllContractTypesForExport(currentParams)),
        options: {
          filename: 'tipos-de-contrato',
          sheetName: 'Tipos de Contrato',
          title: 'Tipos de Contrato',
        },
        formatters: {
          is_active: (value) => activeStatusLabel(value),
          created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
        },
      }}
    />
  );

  return (
    <>
      <CatalogTableSurface>{table}</CatalogTableSurface>
      <CatalogFormSheet
        sheet={sheet}
        getKey={(contractType) => contractType.id}
        title={{ create: 'Nuevo tipo de contrato', edit: 'Editar tipo de contrato' }}
        size="md"
      >
        {() => <ContractTypeForm />}
      </CatalogFormSheet>
    </>
  );
}
