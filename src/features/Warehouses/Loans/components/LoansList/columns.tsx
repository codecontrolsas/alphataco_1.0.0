'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import Link from 'next/link';
import { destinationTypeIcons } from '../../../Movements/components/MovementsList/columns';
import { DESTINATION_TYPE_LABELS } from '../../../lib/labels';
import { LoanRowActions } from '../LoanRowActions';
import type { LoanListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

interface LoanColumnsOptions {
  canReturn: boolean;
  canWriteOff: boolean;
}

export function getColumns({ canReturn, canWriteOff }: LoanColumnsOptions): ColumnDef<LoanListItem>[] {
  return [
    {
      id: 'material_code',
      accessorFn: (row) => row.material.code,
      meta: { title: 'Código' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.material.code}</span>,
    },
    {
      id: 'material',
      accessorFn: (row) => row.material.name,
      meta: { title: 'Material' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Material" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/warehouse/materials/${row.original.material.id}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {row.original.material.name}
        </Link>
      ),
    },
    {
      id: 'serial_number',
      accessorKey: 'serialNumber',
      meta: { title: 'Número de serie' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número de serie" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.serialNumber}</span>,
    },
    {
      id: 'destination_type',
      accessorFn: (row) => row.destinationType ?? '',
      meta: { title: 'Tipo de destino' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de destino" />,
      cell: ({ row }) => {
        const t = row.original.destinationType;
        if (!t) return <span>-</span>;
        const Icon = destinationTypeIcons[t];
        return (
          <Badge variant="outline" className="gap-1">
            <Icon className="h-3 w-3" />
            {DESTINATION_TYPE_LABELS[t]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.destinationType;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },
    {
      id: 'holder',
      accessorFn: (row) => row.holder ?? '',
      meta: { title: 'Tenedor' },
      // Calculado desde varias relaciones del destino (empleado/equipo/orden/cliente): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tenedor" />,
      cell: ({ row }) => <span>{row.original.holder ?? '-'}</span>,
    },
    {
      id: 'since',
      accessorFn: (row) => row.since ?? '',
      meta: { title: 'Desde' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Desde" />,
      // `since` es YYYY-MM-DD (fecha de la salida): se formatea en UTC para no correr un dia
      cell: ({ row }) => <span>{row.original.since ? moment.utc(row.original.since).format('DD/MM/YYYY') : '-'}</span>,
    },
    {
      id: 'days',
      accessorFn: (row) => row.days,
      meta: { title: 'Días en préstamo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Días en préstamo" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.days ?? '-'}</span>,
    },
    {
      id: 'exit',
      accessorFn: (row) => row.exitNumber ?? '',
      meta: { title: 'Salida' },
      // El numero mostrado puede venir de `returned_from` (anulacion de devolucion): no ordenable server-side.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Salida" />,
      cell: ({ row }) =>
        row.original.exitMovementId ? (
          <Link
            href={`/dashboard/warehouse/movements/${row.original.exitMovementId}`}
            className="font-mono text-sm font-medium text-blue-600 hover:underline"
          >
            {row.original.exitNumber}
          </Link>
        ) : (
          <span>-</span>
        ),
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const loan = row.original;
        // Sin salida de origen no hay a que devolver
        if (!loan.exitMovementId) return null;
        return (
          <LoanRowActions
            unitId={loan.unitId}
            exitMovementId={loan.exitMovementId}
            serialNumber={loan.serialNumber}
            materialName={loan.material.name}
            holder={loan.holder}
            canReturn={canReturn}
            canWriteOff={canWriteOff}
          />
        );
      },
    },
  ];
}
