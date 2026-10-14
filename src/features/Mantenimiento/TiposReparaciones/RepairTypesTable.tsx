'use client';

import { DataTable, type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { ArrowDown, ArrowRight, ArrowUp, Check, CircleOff, X } from 'lucide-react';
import { useMemo } from 'react';
import {
  REPAIR_TYPE_HIDDEN_COLUMNS,
  getRepairTypeColumns,
  type RepairTypeRow,
} from './repair-type-columns';

interface RepairTypesTableProps {
  rows: RepairTypeRow[];
  onEdit: (repair: RepairTypeRow) => void;
  canEdit: boolean;
}

const YES_NO = [
  { value: 'Sí', label: 'Sí', icon: Check },
  { value: 'No', label: 'No', icon: X },
];

const DEFAULT_VISIBLE_FILTERS = ['name', 'criticity', 'is_active'];

const NULL_OPTION = { value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff };

/**
 * Catálogo chico de la empresa: llega completo desde el servidor, así que ordena, filtra y
 * pagina en memoria (`inMemory`).
 */
export function RepairTypesTable({ rows, onEdit, canEdit }: RepairTypesTableProps) {
  const columns = useMemo(() => getRepairTypeColumns(onEdit, canEdit), [onEdit, canEdit]);

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(() => {
    const hasNullCriticity = rows.some((row) => row.criticity == null);
    const hasNullKind = rows.some((row) => row.type_of_maintenance == null);
    return [
      { columnId: 'name', title: 'Nombre', type: 'text' },
      { columnId: 'description', title: 'Descripción', type: 'text' },
      {
        columnId: 'criticity',
        title: 'Criticidad',
        options: [
          { value: 'Alta', label: 'Alta', icon: ArrowUp },
          { value: 'Media', label: 'Media', icon: ArrowRight },
          { value: 'Baja', label: 'Baja', icon: ArrowDown },
          ...(hasNullCriticity ? [NULL_OPTION] : []),
        ],
      },
      {
        columnId: 'is_active',
        title: 'Estado',
        options: [
          { value: 'Activo', label: 'Activo', icon: Check },
          { value: 'Inactivo', label: 'Inactivo', icon: X },
        ],
      },
      {
        columnId: 'type_of_maintenance',
        title: 'Tipo de Mantenimiento',
        options: [
          { value: 'Preventivo', label: 'Preventivo' },
          { value: 'Correctivo', label: 'Correctivo' },
          { value: 'Otro', label: 'Otro' },
          ...(hasNullKind ? [NULL_OPTION] : []),
        ],
      },
      { columnId: 'autorizable', title: 'Autorizable', options: YES_NO },
      { columnId: 'multi_equipment', title: 'Multi equipo', options: YES_NO },
      { columnId: 'qr_close', title: 'Cierre por QR', options: YES_NO },
    ];
  }, [rows]);

  const initialColumnVisibility = useMemo(
    () => Object.fromEntries(REPAIR_TYPE_HIDDEN_COLUMNS.map((columnId) => [columnId, false])),
    []
  );

  // Solo 3 filtros visibles de entrada; el resto se activa con el toggle de filtros.
  const initialFilterVisibility = useMemo(
    () => Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)])),
    [facetedFilters]
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalRows={rows.length}
      searchParams={{}}
      inMemory
      tableId="repair-type-table"
      paramNamespace="repair-type-table"
      facetedFilters={facetedFilters}
      initialColumnVisibility={initialColumnVisibility}
      initialFilterVisibility={initialFilterVisibility}
      searchPlaceholder="Buscar por nombre o descripción..."
      showFilterToggle
      emptyMessage="No hay tipos de reparación cargados"
    />
  );
}
