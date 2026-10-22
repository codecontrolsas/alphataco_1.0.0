'use client';

import { LEVEL_TEXT_CLASS } from '@/features/Dashboard/lib/chart-thresholds';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { inMemoryDateSortingFn, inMemoryTextFilterFn } from '@/shared/components/common/DataTable/in-memory';
import { ColumnDef } from '@tanstack/react-table';
import { DailyAbsenceTimeseriesItem } from '../../actions.server';
import { AbsencePercentCell, ViewAbsentButton } from '../absence-cells';

export function getDailyAbsenceColumns(
  onViewEmployees: (row: DailyAbsenceTimeseriesItem) => void
): ColumnDef<DailyAbsenceTimeseriesItem>[] {
  return [
    {
      accessorKey: 'fecha',
      id: 'fecha',
      ...titled('Fecha'),
      cell: ({ row }) => <span className="font-medium">{row.original.fecha}</span>,
      sortingFn: inMemoryDateSortingFn,
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
      accessorKey: 'altas',
      id: 'altas',
      ...titled('Altas'),
      cell: ({ row }) => <div className={`font-medium ${LEVEL_TEXT_CLASS.ok}`}>{row.original.altas || '-'}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'bajas',
      id: 'bajas',
      ...titled('Bajas'),
      cell: ({ row }) => <div className={`font-medium ${LEVEL_TEXT_CLASS.danger}`}>{row.original.bajas || '-'}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'vacaciones',
      id: 'vacaciones',
      ...titled('Vacaciones'),
      cell: ({ row }) => <div>{row.original.vacaciones || '-'}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'totalDotacion',
      id: 'totalDotacion',
      ...titled('Total Dotación'),
      cell: ({ row }) => <div className="font-medium">{row.original.totalDotacion}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'totalAusentes',
      id: 'totalAusentes',
      ...titled('Total Ausentes'),
      cell: ({ row }) => <div>{row.original.totalAusentes}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'porcentajeAusentismo',
      id: 'porcentajeAusentismo',
      ...titled('% Ausentismo'),
      cell: ({ row }) => <AbsencePercentCell value={row.original.porcentajeAusentismo} />,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <ViewAbsentButton
          ariaLabel={`Ver ausentes del ${row.original.fecha}`}
          disabled={row.original.totalAusentes === 0}
          onClick={() => onViewEmployees(row.original)}
        />
      ),
    },
  ];
}
