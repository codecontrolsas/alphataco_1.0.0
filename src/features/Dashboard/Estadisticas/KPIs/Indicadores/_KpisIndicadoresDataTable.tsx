'use client';

import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Check, X } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { KpiDetailModal } from '../components/KpiDetailModal';
import { KpiForm } from '../components/KpiForm';
import { useKpiStore } from '../store/kpi.store';
import { KPI } from '../types';
import { getAllKpisForExport, getKpisPaginated, getKpisSingleFacet, type KpiListItem } from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface KpisIndicadoresDataTableProps {
  data: KpiListItem[];
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

export default function _KpisIndicadoresDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: KpisIndicadoresDataTableProps) {
  // ─── Permisos: construir helper desde el map serializable ─────────────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  // ─── KPI store (para integración con KpiForm) ─────────────────────────────
  const setEditingKpi = useKpiStore((state) => state.setKpi);

  // ─── Modal de detalle ─────────────────────────────────────────────────────
  const [selectedKpi, setSelectedKpi] = useState<KpiListItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleView = useCallback((kpi: KpiListItem) => {
    setSelectedKpi(kpi);
    setIsDetailModalOpen(true);
  }, []);

  const handleLoadKpi = useCallback(
    (kpi: KpiListItem) => {
      // Convertir KpiListItem a KPI (formato del store)
      const kpiForStore: KPI = {
        id: kpi.id,
        company_id: '',
        name: kpi.name,
        code: kpi.code,
        number: kpi.number ?? null,
        validity_date: kpi.validity_date ? moment(kpi.validity_date).format('YYYY-MM-DD') : '',
        calculation_formula: kpi.calculation_formula,
        technical_support: kpi.technical_support ?? true,
        improvement_opportunities: kpi.improvement_opportunities ?? null,
        filters: null,
        is_active: kpi.is_active ?? true,
        created_at: kpi.created_at ? String(kpi.created_at) : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setEditingKpi(kpiForStore);
    },
    [setEditingKpi]
  );

  // ─── Sheet de alta/edición (el form sigue leyendo el store) ───────────────
  const handleClearKpi = useCallback(() => setEditingKpi(null), [setEditingKpi]);
  const sheet = useCatalogSheet<KpiListItem>({
    canCreate: permissions.hasPermission('configuracion', 'kpis', 'create'),
    canUpdate: permissions.hasPermission('configuracion', 'kpis', 'update'),
    onOpenEdit: handleLoadKpi,
    onOpenCreate: handleClearKpi,
    onClosed: handleClearKpi,
  });
  const handleEdit = sheet.openEdit;

  // ─── Client-side navigation: estado reactivo para export con filtros ──────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getKpisPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions, handleView, handleEdit), [permissions, handleView, handleEdit]);

  // ─── Column visibility: merge defaults con preferencias guardadas ─────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── Filter visibility: 3 filtros por defecto ────────────────────────────
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'validity_date', 'code'];

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = [
      'is_active',
      'technical_support',
      'validity_date',
      'created_at',
      'name',
      'code',
      'number',
      'calculation_formula',
      'improvement_opportunities',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories: lazy-load ─────────────────────────────────────

  const makeIsActiveFetchFacet = useCallback(() => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getKpisSingleFacet('is_active', params);
      if (!result) return { options: [], counts: new Map() };
      return {
        options: [
          { value: 'true', label: 'Activo', icon: Check },
          { value: 'false', label: 'Inactivo', icon: X },
        ],
        counts: result.counts,
      };
    };
  }, []);

  const makeTechnicalSupportFetchFacet = useCallback(() => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getKpisSingleFacet('technical_support', params);
      if (!result) return { options: [], counts: new Map() };
      return {
        options: [
          { value: 'true', label: 'Sí', icon: Check },
          { value: 'false', label: 'No', icon: X },
        ],
        counts: result.counts,
      };
    };
  }, []);

  // ─── Filtros facetados con lazy-load ─────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── Booleanos ───────────────────────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: makeIsActiveFetchFacet(),
      },
      {
        columnId: 'technical_support',
        title: 'Soporte Técnico',
        fetchFacet: makeTechnicalSupportFetchFacet(),
      },

      // ── Filtros de rango de fecha ────────────────────────────────────────
      { columnId: 'validity_date', title: 'Vigencia', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Fecha de Creación', type: 'dateRange' as const },

      // ── Filtros de texto libre ───────────────────────────────────────────
      { columnId: 'name', title: 'Nombre', type: 'text' as const, placeholder: 'Buscar por nombre...' },
      { columnId: 'code', title: 'Código', type: 'text' as const, placeholder: 'Buscar por código...' },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      {
        columnId: 'calculation_formula',
        title: 'Fórmula',
        type: 'text' as const,
        placeholder: 'Buscar en fórmula...',
      },
      {
        columnId: 'improvement_opportunities',
        title: 'Oportunidades de Mejora',
        type: 'text' as const,
        placeholder: 'Buscar en oportunidades...',
      },
    ],
    [makeIsActiveFetchFacet, makeTechnicalSupportFetchFacet]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <CatalogTableSurface>
        <DataTable
          columns={columns}
          data={data}
          totalRows={totalRows}
          searchParams={searchParams}
          tableId={tableId}
          paramNamespace={tableId}
          facetedFilters={facetedFilters}
          initialColumnVisibility={mergedColumnVisibility}
          initialFilterVisibility={mergedFilterVisibility}
          showFilterToggle
          toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo KPI" />}
          // Client-side navigation: fetch instantáneo via React Query, sin router.push
          queryFn={tableQueryFn}
          queryKey={['kpis-indicadores-paginated']}
          onStateChange={handleStateChange}
          searchPlaceholder="Buscar por código o nombre..."
          emptyMessage="No se encontraron KPIs"
          exportConfig={{
            fetchAllData: async () => unwrapExportResult(await getAllKpisForExport(currentParams)),
            options: {
              filename: 'kpis-indicadores',
              sheetName: 'KPIs Indicadores',
              title: 'Listado de KPIs Indicadores',
            },
            formatters: {
              validity_date: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
              created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
              is_active: (value) => (value ? 'Activo' : 'Inactivo'),
              technical_support: (value) => (value ? 'Sí' : 'No'),
            },
          }}
        />
      </CatalogTableSurface>

      <CatalogFormSheet
        sheet={sheet}
        getKey={(kpi) => kpi.id}
        title={{ create: 'Nuevo KPI', edit: 'Editar KPI' }}
        size="lg"
      >
        {() => <KpiForm />}
      </CatalogFormSheet>

      {selectedKpi && (
        <KpiDetailModal
          kpi={{
            id: selectedKpi.id,
            company_id: '',
            name: selectedKpi.name,
            code: selectedKpi.code,
            number: selectedKpi.number ?? null,
            validity_date: selectedKpi.validity_date ? moment(selectedKpi.validity_date).format('YYYY-MM-DD') : '',
            calculation_formula: selectedKpi.calculation_formula,
            technical_support: selectedKpi.technical_support ?? true,
            improvement_opportunities: selectedKpi.improvement_opportunities ?? null,
            filters: null,
            is_active: selectedKpi.is_active ?? true,
            created_at: selectedKpi.created_at ? String(selectedKpi.created_at) : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }}
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedKpi(null);
          }}
        />
      )}
    </>
  );
}
