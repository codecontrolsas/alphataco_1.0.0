'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { StackedCell } from '@/shared/components/common/StackedCell';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, HandCoins, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { formatDay } from '../../lib/dates';
import { formatInCurrency } from '../../lib/currency-format';
import type { ReceivableState } from '../../lib/receipt-rules';
import { RECEIVABLE_STATE_UI, TONE_TO_BADGE } from '../../lib/status-presentation';
import type { ReceivableListItem } from './actions.server';
import { NO_DUE_DATE_LABEL } from './constants';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

export const receivableStateIcons = Object.fromEntries(
  Object.entries(RECEIVABLE_STATE_UI).map(([state, ui]) => [state, ui.icon])
) as Record<ReceivableState, LucideIcon>;

/** Destino de "Ver": el cheque rechazado o la factura de Comercial. */
function detailHref(item: ReceivableListItem): string {
  return item.kind === 'CHECK' ? `/dashboard/treasury/checks/${item.id}` : `/dashboard/comercial/facturacion/${item.id}`;
}

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = formatDay;

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
      cell: ({ row }) => <StackedCell primary={row.original.customer.name} secondary={row.original.customer.cuit} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.customer.id),
    },
    {
      id: 'voucher',
      accessorFn: (row) => row.voucherLabel,
      meta: { title: 'Comprobante' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Comprobante" />,
      cell: ({ row }) => (
        <Link href={detailHref(row.original)} className="text-brand-ink whitespace-nowrap font-mono text-sm hover:underline">
          {row.original.voucherLabel}
        </Link>
      ),
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
          <span className="tabular-nums text-destructive">{row.original.overdueDays}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      id: 'state',
      accessorFn: (row) => RECEIVABLE_STATE_UI[row.state].label,
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const ui = RECEIVABLE_STATE_UI[row.original.state];
        const Icon = ui.icon;
        return (
          <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {ui.label}
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
                href={`/dashboard/treasury/receipts/new?customerId=${row.original.customer.id}&${
                  row.original.kind === 'CHECK' ? 'checkId' : 'invoiceId'
                }=${row.original.id}`}
              >
                <HandCoins className="h-3.5 w-3.5" aria-hidden="true" />
                Cobrar
              </Link>
            </Button>
          )}
          <Button asChild type="button" variant="ghost" size="sm" className="h-8 gap-1">
            <Link href={detailHref(row.original)} aria-label={`Ver ${row.original.voucherLabel}`}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Ver
            </Link>
          </Button>
        </div>
      ),
    },
  ];
}
