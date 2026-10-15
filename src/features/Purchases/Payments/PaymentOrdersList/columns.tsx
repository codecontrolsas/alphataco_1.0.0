'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { PAYMENT_ORDER_STATUS_LABELS } from '../../lib/payment-order-state-machine';
import { PaymentOrderStatusBadge } from '../components/PaymentOrderStatusBadge';
import type { PaymentOrderListItem } from './actions.server';
import { NO_PAYMENT_LABEL, PAYMENT_METHOD_LABELS } from './constants';

/** Columnas DATE (sin hora): llegan como medianoche UTC, se leen como fecha para no correr un día. */
const formatDateOnly = (value: Date | string | null) =>
  value ? formatDateAr(new Date(value).toISOString().slice(0, 10)) : '-';

const moneyCell = (value: string) => <span className="tabular-nums">{formatMoney(value)}</span>;

export function getColumns(): ColumnDef<PaymentOrderListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/payments/${row.original.id}`}
          className="font-mono text-sm font-medium text-brand-ink hover:underline"
          aria-label={`Ver orden de pago ${row.original.number}`}
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier.name,
      meta: { title: 'Proveedor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
      cell: ({ row }) => (
        <Link href={`/dashboard/purchases/suppliers/${row.original.supplier.id}`} className="block hover:underline">
          <StackedCell primary={row.original.supplier.name} secondary={`CUIT ${row.original.supplier.cuit}`} />
        </Link>
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.supplier.id),
    },
    {
      id: 'planned_on',
      accessorKey: 'planned_on',
      meta: { title: 'Fecha prevista' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha prevista" />,
      cell: ({ row }) => <span>{formatDateOnly(row.original.planned_on)}</span>,
    },
    {
      id: 'paid_on',
      accessorKey: 'paid_on',
      meta: { title: 'Fecha de pago' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de pago" />,
      cell: ({ row }) => <span>{formatDateOnly(row.original.paid_on)}</span>,
    },
    {
      id: 'status',
      accessorFn: (row) => PAYMENT_ORDER_STATUS_LABELS[row.status],
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <PaymentOrderStatusBadge status={row.original.status} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },
    {
      id: 'invoices_total',
      accessorKey: 'invoices_total',
      meta: { title: 'Aplicado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Aplicado" />,
      cell: ({ row }) => moneyCell(row.original.invoices_total),
    },
    {
      id: 'credits_total',
      accessorKey: 'credits_total',
      meta: { title: 'Notas de crédito' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notas de crédito" />,
      cell: ({ row }) => moneyCell(row.original.credits_total),
    },
    {
      id: 'advance_total',
      accessorKey: 'advance_total',
      meta: { title: 'Anticipos' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Anticipos" />,
      cell: ({ row }) => moneyCell(row.original.advance_total),
    },
    {
      id: 'withholdings_total',
      accessorKey: 'withholdings_total',
      meta: { title: 'Retenciones' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Retenciones" />,
      cell: ({ row }) => moneyCell(row.original.withholdings_total),
    },
    {
      id: 'net_total',
      accessorKey: 'net_total',
      meta: { title: 'Neto' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Neto" />,
      cell: ({ row }) => moneyCell(row.original.net_total),
    },
    {
      id: 'methods',
      accessorFn: (row) => (row.methods.length ? row.methods.map((m) => PAYMENT_METHOD_LABELS[m]).join(', ') : NO_PAYMENT_LABEL),
      meta: { title: 'Medios de pago' },
      // M:M: no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Medios de pago" />,
      cell: ({ row }) =>
        row.original.methods.length === 0 ? (
          <span className="text-muted-foreground">{NO_PAYMENT_LABEL}</span>
        ) : (
          <span>{row.original.methods.map((m) => PAYMENT_METHOD_LABELS[m]).join(', ')}</span>
        ),
      filterFn: (row, _id, value: string[]) => {
        const methods = row.original.methods;
        if (methods.length === 0) return value.includes(NULL_FILTER_VALUE);
        return methods.some((m) => value.includes(m));
      },
    },
    {
      id: 'creator',
      accessorFn: (row) => row.creator.name,
      meta: { title: 'Cargó' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cargó" />,
      cell: ({ row }) => <span>{row.original.creator.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.creator.id),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de alta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de alta" />,
      cell: ({ row }) => <span>{row.original.created_at ? formatArgentinaDay(row.original.created_at) : '-'}</span>,
    },
  ];
}
