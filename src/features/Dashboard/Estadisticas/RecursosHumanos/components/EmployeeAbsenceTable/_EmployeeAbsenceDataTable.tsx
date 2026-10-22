'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { ColumnDef } from '@tanstack/react-table';
import { CircleOff } from 'lucide-react';
import { useMemo } from 'react';
import { EmployeeAbsence } from '../../actions.server';
import { employeeAbsenceColumns } from './columns';

// DataTable requires TData extends Record<string, unknown>.
// EmployeeAbsence is a typed interface, so we cast to satisfy the constraint.
type EmployeeAbsenceRecord = EmployeeAbsence & Record<string, unknown>;

interface Props {
  data: EmployeeAbsence[];
  title?: string;
  tableId?: string;
}

// Opciones de un filtro facetado: los valores presentes, más «Sin asignar» si alguna fila no lo tiene.
function buildOptions(data: EmployeeAbsence[], pick: (row: EmployeeAbsence) => string) {
  const unique = Array.from(new Set(data.map(pick).filter(Boolean))).sort();
  const options = unique.map((value) => ({ value, label: value }));
  return data.some((row) => !pick(row))
    ? [...options, { value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
    : options;
}

// Se muestran 3 filtros; el resto se activa desde el selector de filtros.
const INITIAL_FILTER_VISIBILITY = {
  legajo: true,
  nombre: true,
  motivo: true,
  tarea: false,
  linea: false,
  turno: false,
  desde: false,
  hasta: false,
  diasCaidos: false,
  observaciones: false,
};

export function _EmployeeAbsenceDataTable({ data, title: _title, tableId = 'employee-absence' }: Props) {
  const castedData = data as EmployeeAbsenceRecord[];
  // Tabla de datos por prop: las opciones de los filtros facetados salen de las filas en memoria.
  const tareaOptions = useMemo(() => buildOptions(data, (d) => d.tarea), [data]);
  const lineaOptions = useMemo(() => buildOptions(data, (d) => d.linea), [data]);
  const turnoOptions = useMemo(() => buildOptions(data, (d) => d.turno), [data]);
  const motivoOptions = useMemo(() => buildOptions(data, (d) => d.motivo), [data]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'legajo',
        title: 'Legajo',
        type: 'text',
        placeholder: 'Buscar por legajo...',
      },
      {
        columnId: 'nombre',
        title: 'Nombre',
        type: 'text',
        placeholder: 'Buscar por nombre...',
      },
      {
        columnId: 'tarea',
        title: 'Cargo',
        options: tareaOptions,
      },
      {
        columnId: 'linea',
        title: 'Sector',
        options: lineaOptions,
      },
      {
        columnId: 'turno',
        title: 'Turno',
        options: turnoOptions,
      },
      {
        columnId: 'motivo',
        title: 'Motivo',
        options: motivoOptions,
      },
      {
        columnId: 'desde',
        title: 'Desde',
        type: 'text',
        placeholder: 'Buscar fecha (DD/MM/AAAA)...',
      },
      {
        columnId: 'hasta',
        title: 'Hasta',
        type: 'text',
        placeholder: 'Buscar fecha (DD/MM/AAAA)...',
      },
      {
        columnId: 'diasCaidos',
        title: 'Días Caídos',
        type: 'text',
        placeholder: 'Buscar días caídos...',
      },
      {
        columnId: 'observaciones',
        title: 'Observaciones',
        type: 'text',
        placeholder: 'Buscar en observaciones...',
      },
    ],
    [tareaOptions, lineaOptions, turnoOptions, motivoOptions]
  );

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => castedData,
      options: {
        filename: 'ausencias-empleados',
        sheetName: 'Ausencias',
        title: 'Detalle de Ausencias por Empleado',
      },
      formatters: {
        diasCaidos: (val: unknown) => (val == null || val === '' ? null : Number(val)),
      },
    }),
    [castedData]
  );

  return (
    <DataTable
      columns={employeeAbsenceColumns as ColumnDef<EmployeeAbsenceRecord>[]}
      data={castedData}
      totalRows={castedData.length}
      facetedFilters={facetedFilters}
      searchPlaceholder="Buscar por legajo o nombre..."
      showSearch
      showFilterToggle
      initialFilterVisibility={INITIAL_FILTER_VISIBILITY}
      emptyMessage="No se encontraron ausencias."
      exportConfig={exportConfig}
      tableId={tableId}
      paramNamespace={tableId}
      inMemory
    />
  );
}
