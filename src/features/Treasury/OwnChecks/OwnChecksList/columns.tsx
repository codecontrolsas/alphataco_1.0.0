'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, Eye, FileText, Send, Smartphone, XCircle, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import {
  OWN_CHECK_ALERT_LABEL,
  OWN_CHECK_KIND_LABELS,
  OWN_CHECK_STATUS_LABELS,
  ownCheckAlert,
  type OwnCheckStatus,
} from '../../lib/own-check-transitions';
import { treasuryToday } from '../../lib/today';
import type { OwnCheckListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['kind', 'issue_date', 'debited_on'];

export const ownCheckStatusIcons: Record<OwnCheckStatus, LucideIcon> = {
  ISSUED: Send,
  DEBITED: CheckCircle2,
  REJECTED: XCircle,
  CANCELLED: Ban,
};

export const ownCheckKindIcons: Record<OwnCheckListItem['kind'], LucideIcon> = {
  PHYSICAL: FileText,
  ECHECK: Smartphone,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '';

const dash = <span className="text-muted-foreground">—</span>;

export function getColumns(): ColumnDef<OwnCheckListItem>[] {
  return [
    {
      id: 'select',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
          className="cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar cheque"
          className={row.getCanSelect() ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
        />
      ),
    },
    {
      id: 'number',
      accessorFn: (row) => row.number,
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <Link href={`/dashboard/treasury/own-checks/${row.original.id}`} className="font-mono text-sm font-medium hover:underline">
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'kind',
      accessorFn: (row) => OWN_CHECK_KIND_LABELS[row.kind],
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => {
        const Icon = ownCheckKindIcons[row.original.kind];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {OWN_CHECK_KIND_LABELS[row.original.kind]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.kind),
    },
    {
      id: 'account',
      accessorFn: (row) => row.account.name,
      meta: { title: 'Cuenta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cuenta" />,
      cell: ({ row }) => <span>{row.original.account.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.account.id),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier?.name ?? '',
      meta: { title: 'Proveedor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
      cell: ({ row }) => (row.original.supplier ? <span className="font-medium">{row.original.supplier.name}</span> : dash),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.supplier?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'payment_order',
      accessorFn: (row) => row.paymentOrder?.number ?? '',
      meta: { title: 'Orden de pago' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Orden de pago" />,
      cell: ({ row }) =>
        row.original.paymentOrder ? (
          <Link
            href={`/dashboard/purchases/payments/${row.original.paymentOrder.id}`}
            className="font-mono text-sm font-medium text-blue-600 hover:underline"
          >
            {row.original.paymentOrder.number}
          </Link>
        ) : (
          dash
        ),
    },
    {
      id: 'amount',
      accessorFn: (row) => row.amount ?? '',
      meta: { title: 'Importe' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Importe" />,
      cell: ({ row }) =>
        row.original.amount != null ? <span className="font-medium tabular-nums">{formatMoney(row.original.amount)}</span> : dash,
    },
    {
      id: 'issue_date',
      accessorFn: (row) => row.issueDate,
      meta: { title: 'Emisión' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Emisión" />,
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.issueDate)}</span>,
    },
    {
      id: 'payment_date',
      accessorFn: (row) => row.paymentDate ?? '',
      meta: { title: 'Fecha de pago' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de pago" />,
      cell: ({ row }) => {
        const { paymentDate, status } = row.original;
        if (!paymentDate) return dash;
        const alert = ownCheckAlert(status, paymentDate, treasuryToday());
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{formatValueDate(paymentDate)}</span>
            {alert === 'PENDING_CONFIRMATION' && (
              <Badge variant="outline" className="whitespace-nowrap border-amber-500 text-amber-700 dark:text-amber-400">
                {OWN_CHECK_ALERT_LABEL}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'status',
      accessorFn: (row) => OWN_CHECK_STATUS_LABELS[row.status],
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const Icon = ownCheckStatusIcons[row.original.status];
        return (
          <Badge variant={row.original.status === 'CANCELLED' ? 'secondary' : 'outline'} className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {OWN_CHECK_STATUS_LABELS[row.original.status]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },
    {
      id: 'debited_on',
      accessorFn: (row) => row.debitedOn ?? '',
      meta: { title: 'Débito' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Débito" />,
      cell: ({ row }) =>
        row.original.debitedOn ? <span className="tabular-nums">{formatValueDate(row.original.debitedOn)}</span> : dash,
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
            <Link href={`/dashboard/treasury/own-checks/${row.original.id}`}>
              <Eye className="h-3.5 w-3.5" />
              Ver
            </Link>
          </Button>
        </div>
      ),
    },
  ];
}
