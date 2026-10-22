'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileText, Smartphone, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { formatDay } from '../../lib/dates';
import {
  OWN_CHECK_KIND_LABELS,
  OWN_CHECK_STATUS_LABELS,
  ownCheckAlert,
  type OwnCheckStatus,
} from '../../lib/own-check-transitions';
import { OWN_CHECK_ALERT_UI, OWN_CHECK_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';
import { treasuryToday } from '../../lib/today';
import type { OwnCheckListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['kind', 'issue_date', 'debited_on'];

export const ownCheckStatusIcons = Object.fromEntries(
  Object.entries(OWN_CHECK_STATUS_UI).map(([status, ui]) => [status, ui.icon])
) as Record<OwnCheckStatus, LucideIcon>;

export const ownCheckKindIcons: Record<OwnCheckListItem['kind'], LucideIcon> = {
  PHYSICAL: FileText,
  ECHECK: Smartphone,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = formatDay;

const OwnAlertIcon = OWN_CHECK_ALERT_UI.PENDING_CONFIRMATION.icon;

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
      ...titled('Número'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/treasury/own-checks/${row.original.id}`}
          className="text-brand-ink block hover:underline"
        >
          <StackedCell primary={row.original.number} mono maxWidthClass="max-w-[200px]" />
        </Link>
      ),
    },
    {
      id: 'kind',
      accessorFn: (row) => OWN_CHECK_KIND_LABELS[row.kind],
      ...titled('Tipo'),
      cell: ({ row }) => {
        const Icon = ownCheckKindIcons[row.original.kind];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {OWN_CHECK_KIND_LABELS[row.original.kind]}
          </Badge>
        );
      },
      filterFn: matchesId((r) => r.kind),
    },
    {
      id: 'account',
      accessorFn: (row) => row.account.name,
      ...titled('Cuenta'),
      cell: ({ row }) => (
        <StackedCell
          primary={row.original.account.name}
          secondary={row.original.checkbook ? `Chequera ${row.original.checkbook}` : undefined}
        />
      ),
      filterFn: matchesId((r) => r.account.id),
    },
    {
      id: 'supplier',
      accessorFn: (row) => row.supplier?.name ?? '',
      ...titled('Proveedor'),
      cell: ({ row }) =>
        row.original.supplier ? <span className="font-medium">{row.original.supplier.name}</span> : dash,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.supplier?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'payment_order',
      accessorFn: (row) => row.paymentOrder?.number ?? '',
      ...titled('Orden de pago'),
      cell: ({ row }) =>
        row.original.paymentOrder ? (
          <Link
            href={`/dashboard/purchases/payments/${row.original.paymentOrder.id}`}
            className="text-brand-ink font-mono text-sm font-medium hover:underline"
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
      ...titled('Importe'),
      cell: ({ row }) =>
        row.original.amount != null ? (
          <span className="font-medium tabular-nums">{formatMoney(row.original.amount)}</span>
        ) : (
          dash
        ),
    },
    {
      id: 'issue_date',
      accessorFn: (row) => row.issueDate,
      ...titled('Emisión'),
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.issueDate)}</span>,
    },
    {
      id: 'payment_date',
      accessorFn: (row) => row.paymentDate ?? '',
      ...titled('Fecha de pago'),
      cell: ({ row }) => {
        const { paymentDate, status } = row.original;
        if (!paymentDate) return dash;
        const alert = ownCheckAlert(status, paymentDate, treasuryToday());
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{formatValueDate(paymentDate)}</span>
            {alert === 'PENDING_CONFIRMATION' && (
              <Badge
                variant={TONE_TO_BADGE[OWN_CHECK_ALERT_UI.PENDING_CONFIRMATION.tone]}
                className="gap-1 whitespace-nowrap"
              >
                <OwnAlertIcon className="h-3 w-3" aria-hidden="true" />
                {OWN_CHECK_ALERT_UI.PENDING_CONFIRMATION.label}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'status',
      accessorFn: (row) => OWN_CHECK_STATUS_LABELS[row.status],
      ...titled('Estado'),
      cell: ({ row }) => {
        const ui = OWN_CHECK_STATUS_UI[row.original.status];
        return (
          <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
            <ui.icon className="h-3 w-3" aria-hidden="true" />
            {ui.label}
          </Badge>
        );
      },
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'debited_on',
      accessorFn: (row) => row.debitedOn ?? '',
      ...titled('Débito'),
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
