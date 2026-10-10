'use client';

import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import { TransferRowActions } from '../components/TransferRowActions';
import type { TreasuryTransferListItem } from './actions.server';
import { TRANSFER_STATE_LABELS } from './constants';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['cancel_reason', 'created_at'];

export const transferStateIcons: Record<keyof typeof TRANSFER_STATE_LABELS, LucideIcon> = {
  ACTIVE: CheckCircle2,
  CANCELLED: Ban,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-';

export function getColumns({ canUpdate }: { canUpdate: boolean }): ColumnDef<TreasuryTransferListItem>[] {
  const columns: ColumnDef<TreasuryTransferListItem>[] = [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.number}</span>,
    },
    {
      id: 'date',
      accessorKey: 'date',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.date)}</span>,
    },
    {
      id: 'from_account',
      accessorFn: (row) => row.from_account.name,
      meta: { title: 'Origen' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Origen" />,
      cell: ({ row }) => <span>{row.original.from_account.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.from_account.id),
    },
    {
      id: 'to_account',
      accessorFn: (row) => row.to_account.name,
      meta: { title: 'Destino' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Destino" />,
      cell: ({ row }) => <span>{row.original.to_account.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.to_account.id),
    },
    {
      id: 'amount',
      accessorKey: 'amount',
      meta: { title: 'Importe' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Importe" />,
      cell: ({ row }) => (
        <span className={row.original.cancelled ? 'tabular-nums text-muted-foreground line-through' : 'tabular-nums'}>
          {formatMoney(row.original.amount)}
        </span>
      ),
    },
    {
      id: 'notes',
      accessorKey: 'notes',
      meta: { title: 'Notas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notas" />,
      cell: ({ row }) => <span className="line-clamp-2 max-w-xs">{row.original.notes ?? '-'}</span>,
    },
    {
      id: 'state',
      accessorFn: (row) => (row.cancelled ? TRANSFER_STATE_LABELS.CANCELLED : TRANSFER_STATE_LABELS.ACTIVE),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const key = row.original.cancelled ? 'CANCELLED' : 'ACTIVE';
        const Icon = transferStateIcons[key];
        return (
          <div className="space-y-1">
            <Badge variant={row.original.cancelled ? 'secondary' : 'outline'} className="gap-1 whitespace-nowrap">
              <Icon className="h-3 w-3" />
              {TRANSFER_STATE_LABELS[key]}
            </Badge>
            {row.original.cancelled && row.original.cancel_reason && (
              <p className="max-w-xs text-xs text-muted-foreground">{row.original.cancel_reason}</p>
            )}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.cancelled ? 'CANCELLED' : 'ACTIVE'),
    },
    {
      id: 'cancel_reason',
      accessorKey: 'cancel_reason',
      meta: { title: 'Motivo de anulación' },
      // El motivo ya se ve debajo del estado; esta columna lo hace exportable y filtrable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo de anulación" />,
      cell: ({ row }) => <span>{row.original.cancel_reason ?? '-'}</span>,
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de alta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de alta" />,
      cell: ({ row }) => <span>{moment(row.original.created_at).format('DD/MM/YYYY')}</span>,
    },
  ];

  if (canUpdate) {
    columns.push({
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => (
        <TransferRowActions
          transfer={{ id: row.original.id, number: row.original.number, cancelled: row.original.cancelled }}
        />
      ),
    });
  }

  return columns;
}
