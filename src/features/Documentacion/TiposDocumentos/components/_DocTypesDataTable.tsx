'use client';

import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import { document_applies } from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Check, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { HIDDEN_COLUMNS_BY_DEFAULT, getDocTypeColumns } from '../PersonasList/columns';
import {
  getDocTypeSingleFacet,
  getEmpresaDocTypesForExport,
  getEmpresaDocTypesPaginated,
  getEquiposDocTypesForExport,
  getEquiposDocTypesPaginated,
  getPersonasDocTypesForExport,
  getPersonasDocTypesPaginated,
  type DocumentTypeListItem,
} from '../actions/queries.server';
import { getEquipmentTypeLabel } from '../config/equipmentTypes';
import { _DocumentTypeFormModal } from './_DocumentTypeFormModal';

// ============================================================================
// FACET OPTIONS
// ============================================================================

const BOOL_OPTIONS = [
  { value: 'true', label: 'Sí', icon: Check },
  { value: 'false', label: 'No', icon: X },
];

const STATUS_OPTIONS = [
  { value: 'true', label: 'Activo', icon: Check },
  { value: 'false', label: 'Inactivo', icon: X },
];

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'mandatory', 'explired', 'special'];

// ============================================================================
// SCOPES
// ============================================================================

/** Lo que cambia entre las listas de tipos de documentos de personas, equipos y empresa. */
const SCOPES = {
  [document_applies.Persona]: {
    queryKey: ['doc-types', 'personas'],
    getPaginated: getPersonasDocTypesPaginated,
    getForExport: getPersonasDocTypesForExport,
    exportSlug: 'personas',
    exportLabel: 'Personas',
  },
  [document_applies.Equipos]: {
    queryKey: ['doc-types', 'equipos'],
    getPaginated: getEquiposDocTypesPaginated,
    getForExport: getEquiposDocTypesForExport,
    exportSlug: 'equipos',
    exportLabel: 'Equipos',
  },
  [document_applies.Empresa]: {
    queryKey: ['doc-types', 'empresa'],
    getPaginated: getEmpresaDocTypesPaginated,
    getForExport: getEmpresaDocTypesForExport,
    exportSlug: 'empresa',
    exportLabel: 'Empresa',
  },
} as const;

// ============================================================================
// COMPONENT
// ============================================================================

interface DocTypesDataTableProps {
  applies: document_applies;
  data: DocumentTypeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
  permissionsMap?: Record<string, boolean>;
}

export default function _DocTypesDataTable({
  applies,
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  permissionsMap,
}: DocTypesDataTableProps) {
  const scope = SCOPES[applies];
  const isEquipment = applies === document_applies.Equipos;

  // ─── Modal de edición ─────────────────────────────────────────────────────
  const [editingDocType, setEditingDocType] = useState<DocumentTypeListItem | null>(null);

  // ─── Client-side navigation ───────────────────────────────────────────────
  const { getPaginated } = scope;
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPaginated(params), [getPaginated]);

  // La columna de tipo de equipo solo existe en la lista de equipos
  const columns = useMemo(() => getDocTypeColumns(isEquipment, setEditingDocType), [isEquipment]);

  // ─── fetchFacet factory: estado (activo/inactivo) y booleanos ─────────────
  const makeFetchFacet = useCallback(
    (columnId: string, options: typeof BOOL_OPTIONS) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getDocTypeSingleFacet(columnId, applies, params);
        return { options, counts: result ? result.counts : new Map() };
      },
    [applies]
  );

  // ─── fetchFacet: equipment_type (text-like facet) ─────────────────────────
  const equipmentTypeFetchFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getDocTypeSingleFacet('equipment_type', applies, params);
      if (!result) return { options: [], counts: new Map() };
      // Construir opciones desde los counts mapeando a labels amigables
      const options: { value: string; label: string }[] = [];
      for (const [key] of result.counts) {
        if (key) options.push({ value: key, label: getEquipmentTypeLabel(key) });
      }
      return { options, counts: result.counts };
    },
    [applies]
  );

  // ─── Filtros facetados con lazy-load ──────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'is_active', title: 'Estado', fetchFacet: makeFetchFacet('is_active', STATUS_OPTIONS) },
      { columnId: 'mandatory', title: 'Obligatorio', fetchFacet: makeFetchFacet('mandatory', BOOL_OPTIONS) },
      { columnId: 'explired', title: 'Con vencimiento', fetchFacet: makeFetchFacet('explired', BOOL_OPTIONS) },
      { columnId: 'special', title: 'Condicional', fetchFacet: makeFetchFacet('special', BOOL_OPTIONS) },
      { columnId: 'multiresource', title: 'Multirrecurso', fetchFacet: makeFetchFacet('multiresource', BOOL_OPTIONS) },
      ...(isEquipment
        ? [
            {
              columnId: 'has_policy_number',
              title: 'N° de Póliza',
              fetchFacet: makeFetchFacet('has_policy_number', BOOL_OPTIONS),
            },
          ]
        : []),
      { columnId: 'is_it_montlhy', title: 'Mensual', fetchFacet: makeFetchFacet('is_it_montlhy', BOOL_OPTIONS) },
      { columnId: 'private', title: 'Privado', fetchFacet: makeFetchFacet('private', BOOL_OPTIONS) },
      { columnId: 'down_document', title: 'Doc. de baja', fetchFacet: makeFetchFacet('down_document', BOOL_OPTIONS) },
      ...(isEquipment
        ? [{ columnId: 'equipment_type', title: 'Tipo de equipo', fetchFacet: equipmentTypeFetchFacet }]
        : []),
      { columnId: 'name', title: 'Nombre', type: 'text' as const, placeholder: 'Buscar por nombre...' },
      { columnId: 'created_at', title: 'Fecha de creación', type: 'dateRange' as const },
    ],
    [makeFetchFacet, equipmentTypeFetchFacet, isEquipment]
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <DataTable
        {...tableProps}
        columns={columns}
        data={data}
        totalRows={totalRows}
        queryFn={tableQueryFn}
        queryKey={scope.queryKey}
        searchPlaceholder="Nombre"
        showSearch
        mobileCards
        emptyMessage="No hay tipos de documentos"
        exportConfig={{
          fetchAllData: async () => unwrapExportResult(await scope.getForExport(currentParams)),
          options: {
            filename: `tipos-documentos-${scope.exportSlug}`,
            sheetName: `Tipos Documentos ${scope.exportLabel}`,
            title: `Tipos de Documentos - ${scope.exportLabel}`,
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
            ...(isEquipment
              ? {
                  has_policy_number: (value: unknown) => (value ? 'Sí' : 'No'),
                  equipment_type: (value: unknown) => getEquipmentTypeLabel(value as string | null),
                }
              : {}),
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
        defaultApplies={applies}
        permissionsMap={permissionsMap}
      />
    </>
  );
}
