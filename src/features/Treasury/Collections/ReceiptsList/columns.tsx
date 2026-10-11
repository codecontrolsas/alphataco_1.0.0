'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Check, CheckCircle2, Eye, FilePen, X, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { RECEIPT_STATUS_LABELS } from '../../lib/receipt-rules';
import type { ReceiptListItem } from './actions.server';
import { DRAFT_NUMBER_LABEL, SENT_LABELS, type SentValue } from './constants';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

type ReceiptStatus = ReceiptListItem['status'];

export const receiptStatusIcons: Record<ReceiptStatus, LucideIcon> = {
  DRAFT: FilePen,
  CONFIRMED: CheckCircle2,
  CANCELLED: Ban,
};

export const sentIcons: Record<SentValue, LucideIcon> = {
  YES: Check,
  NO: X,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '';

export function getColumns(): ColumnDef<ReceiptListItem>[] {
  return [
    {
      id: 'number',
      accessorFn: (row) => row.number ?? DRAFT_NUMBER_LABEL,
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) =>
        row.original.number ? (
          <span className="font-mono text-sm font-medium">{row.original.number}</span>
        ) : (
          <span className="text-muted-foreground">{DRAFT_NUMBER_LABEL}</span>
        ),
    },
    {
      id: 'date',
      accessorFn: (row) => row.date,
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.date)}</span>,
    },
    {
      id: 'customer',
      accessorFn: (row) => row.customer.name,
      meta: { title: 'Cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => <span className="font-medium">{row.original.customer.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.customer.id),
    },
    {
      id: 'status',
      accessorFn: (row) => RECEIPT_STATUS_LABELS[row.status],
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const Icon = receiptStatusIcons[row.original.status];
        return (
          <Badge variant={row.original.status === 'CANCELLED' ? 'secondary' : 'outline'} className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {RECEIPT_STATUS_LABELS[row.original.status]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },
    {
      id: 'invoices_count',
      accessorFn: (row) => row.invoicesCount,
      meta: { title: 'Comprobantes' },
      // Solo cuenta las lineas de comprobante: no hay un orden directo equivalente.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Comprobantes" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.invoicesCount}</span>,
    },
    {
      id: 'withholdings_total',
      accessorFn: (row) => row.withholdingsTotal,
      meta: { title: 'Retenciones' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Retenciones" />,
      cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.withholdingsTotal)}</span>,
    },
    {
      id: 'received_total',
      accessorFn: (row) => row.receivedTotal,
      meta: { title: 'Total recibido' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total recibido" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.receivedTotal)}</span>,
    },
    {
      id: 'sent',
      accessorFn: (row) => (row.sent ? SENT_LABELS.YES : SENT_LABELS.NO),
      meta: { title: 'Enviado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Enviado" />,
      cell: ({ row }) => {
        const key: SentValue = row.original.sent ? 'YES' : 'NO';
        const Icon = sentIcons[key];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {SENT_LABELS[key]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.sent ? 'YES' : 'NO'),
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button asChild type="button" variant="ghost" size="sm" className="h-8 gap-1">
            <Link href={`/dashboard/treasury/receipts/${row.original.id}`}>
              <Eye className="h-3.5 w-3.5" />
              Ver
            </Link>
          </Button>
        </div>
      ),
    },
  ];
}
