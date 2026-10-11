'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Clock, Eye, FilePen, HandCoins, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { formatInCurrency } from '../../lib/currency-format';
import { RECEIVABLE_STATE_LABELS, type ReceivableState } from '../../lib/receipt-rules';
import type { ReceivableListItem } from './actions.server';
import { NO_DUE_DATE_LABEL } from './constants';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

export const receivableStateIcons: Record<ReceivableState, LucideIcon> = {
  OVERDUE: AlertCircle,
  DUE: Clock,
  IN_DRAFT: FilePen,
};

const stateBadgeClass: Record<ReceivableState, string> = {
  OVERDUE: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  DUE: '',
  IN_DRAFT: 'bg-secondary text-secondary-foreground',
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '';

interface ColumnsOptions {
  canCollect: boolean;
}

export function getColumns({ canCollect }: ColumnsOptions): ColumnDef<ReceivableListItem>[] {
  return [
    {
      id: 'customer',
      accessorFn: (row) => row.customer.name,
      meta: { title: 'Cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => <span className="font-medium">{row.original.customer.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.customer.id),
    },
    {
      id: 'voucher',
      accessorFn: (row) => row.voucherLabel,
      meta: { title: 'Comprobante' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Comprobante" />,
      cell: ({ row }) => <span className="whitespace-nowrap font-mono text-sm">{row.original.voucherLabel}</span>,
    },
    {
      id: 'issue_date',
      accessorFn: (row) => row.issueDate,
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.issueDate)}</span>,
    },
    {
      id: 'due_date',
      accessorFn: (row) => row.dueDate ?? '',
      meta: { title: 'Vencimiento' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
      cell: ({ row }) =>
        row.original.dueDate ? (
          <span className="tabular-nums">{formatValueDate(row.original.dueDate)}</span>
        ) : (
          <span className="text-muted-foreground">{NO_DUE_DATE_LABEL}</span>
        ),
    },
    {
      id: 'currency',
      accessorFn: (row) => row.currency,
      meta: { title: 'Moneda' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Moneda" />,
      cell: ({ row }) => <span>{row.original.currency}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.currency),
    },
    {
      id: 'total',
      accessorFn: (row) => row.total,
      meta: { title: 'Total' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => <span className="tabular-nums">{formatInCurrency(row.original.total, row.original.currency)}</span>,
    },
    {
      id: 'pending',
      accessorFn: (row) => row.pending,
      meta: { title: 'Pendiente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pendiente" />,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{formatInCurrency(row.original.pending, row.original.currency)}</span>
      ),
    },
    {
      id: 'overdue_days',
      accessorFn: (row) => row.overdueDays,
      meta: { title: 'Días de atraso' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Días de atraso" />,
      cell: ({ row }) =>
        row.original.overdueDays > 0 ? (
          <span className="tabular-nums text-red-600">{row.original.overdueDays}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      id: 'state',
      accessorFn: (row) => RECEIVABLE_STATE_LABELS[row.state],
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const Icon = receivableStateIcons[row.original.state];
        return (
          <Badge variant="outline" className={`gap-1 whitespace-nowrap ${stateBadgeClass[row.original.state]}`}>
            <Icon className="h-3 w-3" />
            {RECEIVABLE_STATE_LABELS[row.original.state]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.state),
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {/* En borrador no queda nada libre: se cobra desde ese borrador (Recibos). */}
          {canCollect && row.original.state !== 'IN_DRAFT' && (
            <Button asChild type="button" variant="outline" size="sm" className="h-8 gap-1">
              <Link
                href={`/dashboard/treasury/receipts/new?customerId=${row.original.customer.id}&invoiceId=${row.original.id}`}
              >
                <HandCoins className="h-3.5 w-3.5" />
                Cobrar
              </Link>
            </Button>
          )}
          <Button asChild type="button" variant="ghost" size="sm" className="h-8 gap-1">
            <Link href={`/dashboard/comercial/facturacion/${row.original.id}`}>
              <Eye className="h-3.5 w-3.5" />
              Ver
            </Link>
          </Button>
        </div>
      ),
    },
  ];
}
