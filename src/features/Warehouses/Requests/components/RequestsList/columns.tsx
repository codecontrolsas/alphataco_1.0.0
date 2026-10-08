'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import Link from 'next/link';
import { destinationTypeIcons } from '../../../Movements/components/MovementsList/columns';
import { DESTINATION_TYPE_LABELS } from '../../../lib/labels';
import { RequestStatusBadge } from '../RequestStatusBadge';
import type { RequestListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

export function getColumns(): ColumnDef<RequestListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/warehouse/requests/${row.original.id}`}
          className="font-mono text-sm font-medium text-blue-600 hover:underline"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'status',
      accessorKey: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <RequestStatusBadge status={row.original.status} />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },
    {
      id: 'requester',
      accessorFn: (row) => row.requester.name,
      meta: { title: 'Solicitante' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Solicitante" />,
      cell: ({ row }) => <span>{row.original.requester.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.requester.id),
    },
    {
      id: 'destination_type',
      accessorKey: 'destination_type',
      meta: { title: 'Tipo de destino' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de destino" />,
      cell: ({ row }) => {
        const t = row.original.destination_type;
        if (!t) return <span>-</span>;
        const Icon = destinationTypeIcons[t];
        return (
          <Badge variant="outline" className="gap-1">
            <Icon className="h-3 w-3" />
            {DESTINATION_TYPE_LABELS[t]}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },
    {
      id: 'destination',
      accessorFn: (row) => row.destination ?? '',
      meta: { title: 'Destino' },
      // Calculado desde varias relaciones (empleado/equipo/orden/cliente): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Destino" />,
      cell: ({ row }) => <span>{row.original.destination ?? '-'}</span>,
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => <span>{moment(row.original.created_at).format('DD/MM/YYYY')}</span>,
    },
    {
      id: 'progress',
      accessorFn: (row) => `${row.progress.done} / ${row.progress.total}`,
      meta: { title: 'Avance' },
      // Derivado de las entregas (agregado, no es un campo de la base): ni ordenable ni filtrable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Avance" />,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.progress.done} / {row.original.progress.total}
        </span>
      ),
    },
    {
      id: 'decider',
      accessorFn: (row) => row.decider?.name ?? '',
      meta: { title: 'Decidió' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Decidió" />,
      cell: ({ row }) => <span>{row.original.decider?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.decider?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
  ];
}
