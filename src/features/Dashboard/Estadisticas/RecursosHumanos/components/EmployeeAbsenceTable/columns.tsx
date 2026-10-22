'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { inMemoryDateSortingFn, inMemoryTextFilterFn } from '@/shared/components/common/DataTable/in-memory';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { ColumnDef, Row } from '@tanstack/react-table';
import Link from 'next/link';
import { EmployeeAbsence } from '../../actions.server';

/**
 * Filtro facetado que además entiende «Sin asignar»: las filas con valor vacío (la celda muestra «—»)
 * coinciden con `NULL_FILTER_VALUE`.
 */
function facetedOrUnassignedFilterFn(row: Row<EmployeeAbsence>, columnId: string, filterValue: unknown): boolean {
  const values = Array.isArray(filterValue) ? filterValue.map(String) : filterValue ? [String(filterValue)] : [];
  if (values.length === 0) return true;
  const cell = String(row.getValue(columnId) ?? '');
  return cell === '' ? values.includes(NULL_FILTER_VALUE) : values.includes(cell);
}

export const employeeAbsenceColumns: ColumnDef<EmployeeAbsence>[] = [
  {
    accessorKey: 'legajo',
    id: 'legajo',
    meta: { title: 'Legajo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo" />,
    cell: ({ row }) => <div className="font-medium">{row.original.legajo}</div>,
    filterFn: inMemoryTextFilterFn,
  },
  {
    accessorKey: 'nombre',
    id: 'nombre',
    meta: { title: 'Nombre' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Apellido y Nombre" />,
    cell: ({ row }) => {
      const emp = row.original;
      return emp.id ? (
        <Link
          href={`/dashboard/employee/action?action=view&employee_id=${emp.id}`}
          className="text-primary hover:underline"
          target="_blank"
        >
          {emp.nombre}
        </Link>
      ) : (
        <span>{emp.nombre}</span>
      );
    },
    filterFn: inMemoryTextFilterFn,
  },
  {
    accessorKey: 'tarea',
    id: 'tarea',
    meta: { title: 'Tarea' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cargo" />,
    cell: ({ row }) => <span>{row.original.tarea || '—'}</span>,
    filterFn: facetedOrUnassignedFilterFn,
  },
  {
    accessorKey: 'linea',
    id: 'linea',
    meta: { title: 'Línea' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sector" />,
    cell: ({ row }) => (row.original.linea ? <Badge variant="outline">{row.original.linea}</Badge> : <span>—</span>),
    filterFn: facetedOrUnassignedFilterFn,
  },
  {
    accessorKey: 'turno',
    id: 'turno',
    meta: { title: 'Turno' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Turno" />,
    cell: ({ row }) => <span>{row.original.turno || '—'}</span>,
    filterFn: facetedOrUnassignedFilterFn,
  },
  {
    accessorKey: 'motivo',
    id: 'motivo',
    meta: { title: 'Motivo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo" />,
    cell: ({ row }) => <span>{row.original.motivo || '—'}</span>,
    filterFn: facetedOrUnassignedFilterFn,
  },
  {
    accessorKey: 'desde',
    id: 'desde',
    meta: { title: 'Desde' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Desde" />,
    cell: ({ row }) => <span>{row.original.desde || '—'}</span>,
    enableSorting: true,
    sortingFn: inMemoryDateSortingFn,
    filterFn: inMemoryTextFilterFn,
  },
  {
    accessorKey: 'hasta',
    id: 'hasta',
    meta: { title: 'Hasta' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Hasta" />,
    cell: ({ row }) => <span>{row.original.hasta || '—'}</span>,
    enableSorting: true,
    sortingFn: inMemoryDateSortingFn,
    filterFn: inMemoryTextFilterFn,
  },
  {
    accessorKey: 'diasCaidos',
    id: 'diasCaidos',
    meta: { title: 'Días Caídos' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Días Caídos" />,
    cell: ({ row }) => <div className="font-medium">{row.original.diasCaidos}</div>,
    enableSorting: true,
    filterFn: inMemoryTextFilterFn,
  },
  {
    accessorKey: 'observaciones',
    id: 'observaciones',
    meta: { title: 'Observaciones' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Observaciones" />,
    cell: ({ row }) => (
      <div className="text-muted-foreground max-w-xs truncate" title={row.original.observaciones}>
        {row.original.observaciones || '—'}
      </div>
    ),
    filterFn: inMemoryTextFilterFn,
  },
];
