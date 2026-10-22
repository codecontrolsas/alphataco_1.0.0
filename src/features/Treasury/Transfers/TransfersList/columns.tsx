'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import type { ColumnDef } from '@tanstack/react-table';
import { formatArgentinaDateTime } from '../../lib/today';
import { AccountCell } from '../../components/AccountCell';
import { TreasuryStatusBadge } from '../../components/TreasuryStatusBadge';
import { TRANSFER_STATE_UI } from '../../lib/status-presentation';
import { TransferRowActions } from '../components/TransferRowActions';
import type { TreasuryTransferListItem } from './actions.server';
import { TRANSFER_STATE_LABELS } from './constants';
import { formatDay } from '../../lib/dates';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['cancel_reason', 'created_at'];

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) => formatDay(value) || '-';

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
      cell: ({ row }) => <AccountCell account={row.original.from_account} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.from_account.id),
    },
    {
      id: 'to_account',
      accessorFn: (row) => row.to_account.name,
      meta: { title: 'Destino' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Destino" />,
      cell: ({ row }) => <AccountCell account={row.original.to_account} />,
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
        return (
          <div className="space-y-1">
            <TreasuryStatusBadge ui={TRANSFER_STATE_UI[key]} />
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
      cell: ({ row }) => <span className="tabular-nums">{formatArgentinaDateTime(row.original.created_at)}</span>,
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
