'use client';

import { Button } from '@/components/ui/button';
import { DataTableColumnHeader, inMemoryTextFilterFn } from '@/shared/components/common/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { Users } from 'lucide-react';
import { DepartmentAbsenceSummaryItem } from '../../actions.server';
import { ABSENCE_BADGE_CLASS, absenceLevel, formatAbsencePercent } from '../../lib/absence-level';

export function getDepartmentSummaryColumns(
  onViewEmployees: (row: DepartmentAbsenceSummaryItem) => void
): ColumnDef<DepartmentAbsenceSummaryItem>[] {
  return [
    {
      accessorKey: 'sector',
      id: 'sector',
      meta: { title: 'Sector' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector" />,
      cell: ({ row }) => <span className="font-medium">{row.original.sector}</span>,
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
      accessorKey: 'ausentes',
      id: 'ausentes',
      meta: { title: 'Ausentes' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ausentes" />,
      cell: ({ row }) => <div>{row.original.ausentes}</div>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'porcentaje',
      id: 'porcentaje',
      meta: { title: '% Ausentismo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="% Ausentismo" />,
      cell: ({ row }) => {
        const p = row.original.porcentaje;
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
          aria-label={`Ver ausentes de ${row.original.sector}`}
          onClick={() => onViewEmployees(row.original)}
          disabled={row.original.ausentes === 0}
          className="gap-1.5"
        >
          <Users className="h-3.5 w-3.5" />
          Ver ausentes
        </Button>
      ),
    },
  ];
}
