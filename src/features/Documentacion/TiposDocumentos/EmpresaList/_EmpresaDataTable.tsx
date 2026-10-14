'use client';

import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import { document_applies } from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { Check, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { HIDDEN_COLUMNS_BY_DEFAULT, getDocTypeColumns } from '../PersonasList/columns';
import {
  getDocTypeSingleFacet,
  getEmpresaDocTypesForExport,
  getEmpresaDocTypesPaginated,
  type DocumentTypeListItem,
} from '../actions/queries.server';
import { _DocumentTypeFormModal } from '../components/_DocumentTypeFormModal';

// ============================================================================
// BOOL FACET OPTIONS
// ============================================================================

const BOOL_OPTIONS = [
  { value: 'true', label: 'Sí', icon: Check },
  { value: 'false', label: 'No', icon: X },
];

const STATUS_OPTIONS = [
  { value: 'true', label: 'Activo', icon: Check },
  { value: 'false', label: 'Inactivo', icon: X },
];

// ============================================================================
// TYPES
// ============================================================================

interface EmpresaDataTableProps {
  data: DocumentTypeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _EmpresaDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: EmpresaDataTableProps) {
  // ─── Modal de edición ─────────────────────────────────────────────────────
  const [editingDocType, setEditingDocType] = useState<DocumentTypeListItem | null>(null);

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getEmpresaDocTypesPaginated(params), []);

  // ─── Columnas (sin equipment_type) ───────────────────────────────────────
  const columns = useMemo(() => getDocTypeColumns(false, setEditingDocType), []);

  // ─── Visibilidad de columnas ──────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── Filtros visibles por defecto ─────────────────────────────────────────
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'mandatory', 'explired', 'special'];

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = [
      'is_active',
      'mandatory',
      'explired',
      'special',
      'multiresource',
      'is_it_montlhy',
      'private',
      'down_document',
      'name',
      'created_at',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factory: estado (activo/inactivo) ────────────────────────
  const makeStatusFetchFacet = useCallback(() => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getDocTypeSingleFacet('is_active', document_applies.Empresa, params);
      if (!result) return { options: STATUS_OPTIONS, counts: new Map() };
      return { options: STATUS_OPTIONS, counts: result.counts };
    };
  }, []);

  // ─── fetchFacet factory: booleanos ────────────────────────────────────────
  const makeBoolFetchFacet = useCallback((columnId: string) => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getDocTypeSingleFacet(columnId, document_applies.Empresa, params);
      if (!result) return { options: BOOL_OPTIONS, counts: new Map() };
      return { options: BOOL_OPTIONS, counts: result.counts };
    };
  }, []);

  // ─── Filtros facetados con lazy-load ──────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── Estado ──────────────────────────────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: makeStatusFetchFacet(),
      },
      // ── Booleanos ──────────────────────────────────────────────────────────
      {
        columnId: 'mandatory',
        title: 'Obligatorio',
        fetchFacet: makeBoolFetchFacet('mandatory'),
      },
      {
        columnId: 'explired',
        title: 'Con vencimiento',
        fetchFacet: makeBoolFetchFacet('explired'),
      },
      {
        columnId: 'special',
        title: 'Condicional',
        fetchFacet: makeBoolFetchFacet('special'),
      },
      {
        columnId: 'multiresource',
        title: 'Multirrecurso',
        fetchFacet: makeBoolFetchFacet('multiresource'),
      },
      {
        columnId: 'is_it_montlhy',
        title: 'Mensual',
        fetchFacet: makeBoolFetchFacet('is_it_montlhy'),
      },
      {
        columnId: 'private',
        title: 'Privado',
        fetchFacet: makeBoolFetchFacet('private'),
      },
      {
        columnId: 'down_document',
        title: 'Doc. de baja',
        fetchFacet: makeBoolFetchFacet('down_document'),
      },
      // ── Texto libre ────────────────────────────────────────────────────────
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },
      // ── Rango de fechas ────────────────────────────────────────────────────
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    [makeStatusFetchFacet, makeBoolFetchFacet]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
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
        queryFn={tableQueryFn}
        queryKey={['doc-types', 'empresa']}
        onStateChange={handleStateChange}
        searchPlaceholder="Nombre"
        showSearch
        mobileCards
        emptyMessage="No hay tipos de documentos"
        exportConfig={{
          fetchAllData: () => getEmpresaDocTypesForExport(currentParams),
          options: {
            filename: 'tipos-documentos-empresa',
            sheetName: 'Tipos Documentos Empresa',
            title: 'Tipos de Documentos - Empresa',
          },
          formatters: {
            is_active: (value) => (value ? 'Activo' : 'Inactivo'),
            mandatory: (value) => (value ? 'Sí' : 'No'),
            explired: (value) => (value ? 'Sí' : 'No'),
            special: (value) => (value ? 'Sí' : 'No'),
            multiresource: (value) => (value ? 'Sí' : 'No'),
            is_it_montlhy: (value) => (value ? 'Mensual' : 'Permanente'),
            private: (value) => (value ? 'Sí' : 'No'),
            down_document: (value) => (value ? 'Sí' : 'No'),
            created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
          },
        }}
      />

      {/* Modal de edición */}
      <_DocumentTypeFormModal
        open={!!editingDocType}
        onOpenChange={(v) => {
          if (!v) setEditingDocType(null);
        }}
        documentType={editingDocType}
        defaultApplies={document_applies.Empresa}
      />
    </>
  );
}
