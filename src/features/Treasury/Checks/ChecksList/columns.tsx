'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Ban, Clock, Eye, FileText, Landmark, Percent, Send, Smartphone, Wallet, XCircle, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { CHECK_KIND_LABELS, CHECK_STATUS_LABELS, type CheckStatus } from '../../lib/check-transitions';
import { DEPOSIT_WARNING_LABELS } from '../../lib/checks-dates';
import type { CheckListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['drawer_cuit', 'issue_date', 'bank', 'kind'];

export const checkStatusIcons: Record<CheckStatus, LucideIcon> = {
  IN_PORTFOLIO: Wallet,
  DEPOSITED: Landmark,
  ENDORSED: Send,
  DISCOUNTED: Percent,
  REJECTED: XCircle,
  CANCELLED: Ban,
};

export const checkKindIcons: Record<CheckListItem['kind'], LucideIcon> = {
  PHYSICAL: FileText,
  ECHECK: Smartphone,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '';

const warningClass = {
  DUE_SOON: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  EXPIRED: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
} as const;

const warningIcon = { DUE_SOON: Clock, EXPIRED: AlertCircle } as const;

export function getColumns(): ColumnDef<CheckListItem>[] {
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
        <Link href={`/dashboard/treasury/checks/${row.original.id}`} className="font-mono text-sm font-medium hover:underline">
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'bank',
      accessorFn: (row) => row.bank,
      meta: { title: 'Banco' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Banco" />,
      cell: ({ row }) => <span>{row.original.bank}</span>,
    },
    {
      id: 'kind',
      accessorFn: (row) => CHECK_KIND_LABELS[row.kind],
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => {
        const Icon = checkKindIcons[row.original.kind];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {CHECK_KIND_LABELS[row.original.kind]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.kind),
    },
    {
      id: 'drawer_name',
      accessorFn: (row) => row.drawerName,
      meta: { title: 'Librador' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Librador" />,
      cell: ({ row }) => <span>{row.original.drawerName}</span>,
    },
    {
      id: 'drawer_cuit',
      accessorFn: (row) => row.drawerCuit,
      meta: { title: 'CUIT' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIT" />,
      cell: ({ row }) => <span className="font-mono text-sm tabular-nums">{row.original.drawerCuit}</span>,
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
      id: 'amount',
      accessorFn: (row) => row.amount,
      meta: { title: 'Importe' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Importe" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.amount)}</span>,
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
      accessorFn: (row) => row.paymentDate,
      meta: { title: 'Fecha de pago' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de pago" />,
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.paymentDate)}</span>,
    },
    {
      id: 'deposit_deadline',
      accessorFn: (row) => row.depositDeadline,
      meta: { title: 'Vence para depositar' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vence para depositar" />,
      cell: ({ row }) => {
        const warning = row.original.depositWarning;
        const WarningIcon = warning === 'OK' ? null : warningIcon[warning];
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{formatValueDate(row.original.depositDeadline)}</span>
            {warning !== 'OK' && WarningIcon && (
              <Badge variant="outline" className={`gap-1 whitespace-nowrap ${warningClass[warning]}`}>
                <WarningIcon className="h-3 w-3" />
                {DEPOSIT_WARNING_LABELS[warning]}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'status',
      accessorFn: (row) => CHECK_STATUS_LABELS[row.status],
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const Icon = checkStatusIcons[row.original.status];
        return (
          <Badge variant={row.original.status === 'CANCELLED' ? 'secondary' : 'outline'} className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {CHECK_STATUS_LABELS[row.original.status]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },
    {
      id: 'portfolio',
      accessorFn: (row) => row.portfolio.name,
      meta: { title: 'Cartera' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cartera" />,
      cell: ({ row }) => <span>{row.original.portfolio.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.portfolio.id),
    },
    {
      id: 'destination',
      accessorFn: (row) => row.destination,
      meta: { title: 'Destino' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Destino" />,
      cell: ({ row }) =>
        row.original.destination ? <span>{row.original.destination}</span> : <span className="text-muted-foreground">—</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.destinationId;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
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
            <Link href={`/dashboard/treasury/checks/${row.original.id}`}>
              <Eye className="h-3.5 w-3.5" />
              Ver
            </Link>
          </Button>
        </div>
      ),
    },
  ];
}
