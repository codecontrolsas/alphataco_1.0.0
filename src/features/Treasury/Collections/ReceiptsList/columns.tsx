'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { formatDay } from '../../lib/dates';
import { RECEIPT_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';
import type { ReceiptListItem } from './actions.server';
import { DRAFT_NUMBER_LABEL, SENT_LABELS, type SentValue } from './constants';

/** La fecha viaja bajo el número del recibo; la columna sigue disponible (y su filtro) desde el selector de columnas. */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['date'];

type ReceiptStatus = ReceiptListItem['status'];

export const receiptStatusIcons = Object.fromEntries(
  Object.entries(RECEIPT_STATUS_UI).map(([status, ui]) => [status, ui.icon])
) as Record<ReceiptStatus, LucideIcon>;

export const sentIcons: Record<SentValue, LucideIcon> = {
  YES: Check,
  NO: X,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = formatDay;

export function getColumns(): ColumnDef<ReceiptListItem>[] {
  return [
    {
      id: 'number',
      accessorFn: (row) => row.number ?? DRAFT_NUMBER_LABEL,
      ...titled('Número'),
      cell: ({ row }) => (
        <Link href={`/dashboard/treasury/receipts/${row.original.id}`} className="text-brand-ink block hover:underline">
          <StackedCell
            primary={row.original.number ?? DRAFT_NUMBER_LABEL}
            secondary={formatDay(row.original.date)}
            mono={row.original.number != null}
            maxWidthClass="max-w-[200px]"
          />
        </Link>
      ),
    },
    {
      id: 'date',
      accessorFn: (row) => row.date,
      ...titled('Fecha'),
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.date)}</span>,
    },
    {
      id: 'customer',
      accessorFn: (row) => row.customer.name,
      ...titled('Cliente'),
      cell: ({ row }) => <StackedCell primary={row.original.customer.name} secondary={row.original.customer.cuit} />,
      filterFn: matchesId((r) => r.customer.id),
    },
    {
      id: 'status',
      accessorFn: (row) => RECEIPT_STATUS_UI[row.status].label,
      ...titled('Estado'),
      cell: ({ row }) => {
        const ui = RECEIPT_STATUS_UI[row.original.status];
        const Icon = ui.icon;
        return (
          <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {ui.label}
          </Badge>
        );
      },
      filterFn: matchesId((r) => r.status),
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
      ...titled('Retenciones'),
      cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.withholdingsTotal)}</span>,
    },
    {
      id: 'received_total',
      accessorFn: (row) => row.receivedTotal,
      ...titled('Total recibido'),
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.receivedTotal)}</span>,
    },
    {
      id: 'sent',
      accessorFn: (row) => (row.sent ? SENT_LABELS.YES : SENT_LABELS.NO),
      ...titled('Enviado'),
      cell: ({ row }) => {
        const key: SentValue = row.original.sent ? 'YES' : 'NO';
        const Icon = sentIcons[key];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {SENT_LABELS[key]}
          </Badge>
        );
      },
      filterFn: matchesId((r) => (r.sent ? 'YES' : 'NO')),
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
            <Link
              href={`/dashboard/treasury/receipts/${row.original.id}`}
              aria-label={`Ver recibo ${row.original.number ?? DRAFT_NUMBER_LABEL}`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Ver
            </Link>
          </Button>
        </div>
      ),
    },
  ];
}
