'use client';

import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { inMemoryTextFilterFn } from '@/shared/components/common/DataTable/in-memory';
import { ColumnDef } from '@tanstack/react-table';
import { DepartmentAbsenceSummaryItem } from '../../actions.server';
import { AbsencePercentCell, ViewAbsentButton } from '../absence-cells';

export function getDepartmentSummaryColumns(
  onViewEmployees: (row: DepartmentAbsenceSummaryItem) => void
): ColumnDef<DepartmentAbsenceSummaryItem>[] {
  return [
    {
      accessorKey: 'sector',
      id: 'sector',
      ...titled('Sector'),
      cell: ({ row }) => <span className="font-medium">{row.original.sector}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'dotacion',
      id: 'dotacion',
      ...titled('Dotación'),
      cell: ({ row }) => <div>{row.original.dotacion}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'ausentes',
      id: 'ausentes',
      ...titled('Ausentes'),
      cell: ({ row }) => <div>{row.original.ausentes}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'porcentaje',
      id: 'porcentaje',
      ...titled('% Ausentismo'),
      cell: ({ row }) => <AbsencePercentCell value={row.original.porcentaje} />,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <ViewAbsentButton
          ariaLabel={`Ver ausentes de ${row.original.sector}`}
          disabled={row.original.ausentes === 0}
          onClick={() => onViewEmployees(row.original)}
        />
      ),
    },
  ];
}
