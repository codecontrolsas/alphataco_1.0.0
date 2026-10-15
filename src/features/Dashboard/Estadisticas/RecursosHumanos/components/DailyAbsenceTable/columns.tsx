'use client';

import { Button } from '@/components/ui/button';
import { LEVEL_TEXT_CLASS } from '@/features/Dashboard/lib/chart-thresholds';
import {
  DataTableColumnHeader,
  inMemoryDateSortingFn,
  inMemoryTextFilterFn,
} from '@/shared/components/common/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { Users } from 'lucide-react';
import { DailyAbsenceTimeseriesItem } from '../../actions.server';
import { ABSENCE_BADGE_CLASS, absenceLevel, formatAbsencePercent } from '../../lib/absence-level';

export function getDailyAbsenceColumns(
  onViewEmployees: (row: DailyAbsenceTimeseriesItem) => void
): ColumnDef<DailyAbsenceTimeseriesItem>[] {
  return [
    {
      accessorKey: 'fecha',
      id: 'fecha',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => <span className="font-medium">{row.original.fecha}</span>,
      sortingFn: inMemoryDateSortingFn,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'dotacion',
      id: 'dotacion',
      meta: { title: 'Dotación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dotación" />,
      cell: ({ row }) => <div>{row.original.dotacion}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'altas',
      id: 'altas',
      meta: { title: 'Altas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Altas" />,
      cell: ({ row }) => <div className={`font-medium ${LEVEL_TEXT_CLASS.ok}`}>{row.original.altas || '-'}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'bajas',
      id: 'bajas',
      meta: { title: 'Bajas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bajas" />,
      cell: ({ row }) => <div className={`font-medium ${LEVEL_TEXT_CLASS.danger}`}>{row.original.bajas || '-'}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'vacaciones',
      id: 'vacaciones',
      meta: { title: 'Vacaciones' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vacaciones" />,
      cell: ({ row }) => <div>{row.original.vacaciones || '-'}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'totalDotacion',
      id: 'totalDotacion',
      meta: { title: 'Total Dotación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total Dotación" />,
      cell: ({ row }) => <div className="font-medium">{row.original.totalDotacion}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'totalAusentes',
      id: 'totalAusentes',
      meta: { title: 'Total Ausentes' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total Ausentes" />,
      cell: ({ row }) => <div>{row.original.totalAusentes}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'porcentajeAusentismo',
      id: 'porcentajeAusentismo',
      meta: { title: '% Ausentismo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="% Ausentismo" />,
      cell: ({ row }) => {
        const p = row.original.porcentajeAusentismo;
        return (
          <div>
            <span className={`rounded px-2 py-1 text-xs font-medium ${ABSENCE_BADGE_CLASS[absenceLevel(p)]}`}>
              {formatAbsencePercent(p)}
            </span>
          </div>
        );
      },
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Ver ausentes del ${row.original.fecha}`}
          onClick={() => onViewEmployees(row.original)}
          disabled={row.original.totalAusentes === 0}
          className="gap-1.5"
        >
          <Users className="h-3.5 w-3.5" />
          Ver ausentes
        </Button>
      ),
    },
  ];
}
