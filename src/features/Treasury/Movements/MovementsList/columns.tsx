'use client';

import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowLeftRight,
  HandCoins,
  Pencil,
  PiggyBank,
  ScrollText,
  Truck,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../actions/concepts.server';
import { AccountCell } from '../../components/AccountCell';
import { TreasuryStatusBadge } from '../../components/TreasuryStatusBadge';
import { formatDay } from '../../lib/dates';
import { MOVEMENT_STATE_UI } from '../../lib/status-presentation';
import { TREASURY_MOVEMENT_KIND_LABELS } from '../../schemas/movements';
import { MovementRowActions } from '../components/MovementRowActions';
import type { TreasuryMovementListItem } from './actions.server';
import { MOVEMENT_STATE_LABELS } from './constants';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at', 'cancel_reason'];

export const NO_CONCEPT_LABEL = 'Sin asignar';

type MovementKind = TreasuryMovementListItem['kind'];

export const movementKindIcons: Record<MovementKind, LucideIcon> = {
  OPENING: PiggyBank,
  MANUAL: Pencil,
  TRANSFER: ArrowLeftRight,
  SUPPLIER_PAYMENT: Truck,
  CUSTOMER_RECEIPT: HandCoins,
  CHECK_OPERATION: WalletCards,
  OWN_CHECK: ScrollText,
};

/** Fecha valor (YYYY-MM-DD, sin hora): se formatea tal cual para no correr un dia. */
export const formatValueDate = (value: string | null | undefined) => formatDay(value) || '-';

const isIncome = (amount: string) => !amount.startsWith('-');
const absAmount = (amount: string) => (amount.startsWith('-') ? amount.slice(1) : amount);

interface ColumnsOptions {
  canUpdate: boolean;
  accounts: TreasuryAccountRow[];
  concepts: TreasuryConceptRow[];
}

export function getColumns({ canUpdate, accounts, concepts }: ColumnsOptions): ColumnDef<TreasuryMovementListItem>[] {
  const columns: ColumnDef<TreasuryMovementListItem>[] = [
    {
      id: 'date',
      accessorKey: 'date',
      ...titled('Fecha'),
      cell: ({ row }) => <span className="tabular-nums">{formatValueDate(row.original.date)}</span>,
    },
    {
      id: 'account',
      accessorFn: (row) => row.account.name,
      ...titled('Cuenta'),
      cell: ({ row }) => <AccountCell account={row.original.account} />,
      filterFn: matchesId((r) => r.account.id),
    },
    {
      id: 'kind',
      accessorFn: (row) => TREASURY_MOVEMENT_KIND_LABELS[row.kind],
      ...titled('Tipo'),
      cell: ({ row }) => {
        const Icon = movementKindIcons[row.original.kind];
        return (
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <Icon className="h-3 w-3" />
            {TREASURY_MOVEMENT_KIND_LABELS[row.original.kind]}
          </Badge>
        );
      },
      filterFn: matchesId((r) => r.kind),
    },
    {
      id: 'concept',
      accessorFn: (row) => row.concept?.name ?? '',
      ...titled('Concepto'),
      cell: ({ row }) => <span>{row.original.concept?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.concept?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'description',
      accessorKey: 'description',
      ...titled('Descripción'),
      cell: ({ row }) => <span className="line-clamp-2 max-w-xs">{row.original.description ?? '-'}</span>,
    },
    {
      id: 'origin',
      accessorFn: (row) =>
        (row.ownCheck ? `Ch. Nº ${row.ownCheck.number}` : null) ??
        row.paymentOrder?.number ??
        row.customerReceipt?.number ??
        row.transfer?.number ??
        row.checkOperation?.number ??
        '',
      meta: { title: 'Origen' },
      // Sin orden directo: el numero vive en dos relaciones distintas.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Origen" />,
      cell: ({ row }) => {
        const { paymentOrder, transfer, customerReceipt, checkOperation, ownCheck } = row.original;
        const linkClass = 'text-brand-ink hover:underline';
        if (ownCheck) {
          return (
            <StackedCell
              mono
              primary={
                <Link href={`/dashboard/treasury/own-checks/${ownCheck.id}`} className={linkClass}>
                  Ch. Nº {ownCheck.number}
                </Link>
              }
              secondary="Cheque propio"
            />
          );
        }
        if (paymentOrder) {
          return (
            <StackedCell
              mono
              primary={
                <Link href={`/dashboard/purchases/payments/${paymentOrder.id}`} className={linkClass}>
                  {paymentOrder.number}
                </Link>
              }
              secondary="Orden de pago"
            />
          );
        }
        if (customerReceipt) {
          return (
            <StackedCell
              mono
              primary={
                <Link href={`/dashboard/treasury/receipts/${customerReceipt.id}`} className={linkClass}>
                  {customerReceipt.number ?? 'Recibo'}
                </Link>
              }
              secondary="Recibo de cobranza"
            />
          );
        }
        if (checkOperation) {
          return (
            <StackedCell
              mono
              primary={
                checkOperation.checkId ? (
                  <Link href={`/dashboard/treasury/checks/${checkOperation.checkId}`} className={linkClass}>
                    {checkOperation.number}
                  </Link>
                ) : (
                  checkOperation.number
                )
              }
              secondary="Operación de cheques"
            />
          );
        }
        if (transfer) {
          return (
            <StackedCell
              mono
              primary={
                <Link href="/dashboard/treasury?tab=transferencias" className={linkClass}>
                  {transfer.number}
                </Link>
              }
              secondary="Transferencia"
            />
          );
        }
        return <span className="text-muted-foreground">-</span>;
      },
    },
    {
      id: 'income',
      accessorFn: (row) => (isIncome(row.amount) ? row.amount : ''),
      ...titled('Ingreso'),
      cell: ({ row }) =>
        isIncome(row.original.amount) ? (
          <span
            className={
              row.original.cancelled ? 'tabular-nums text-muted-foreground line-through' : 'tabular-nums text-ok'
            }
          >
            {formatMoney(row.original.amount)}
          </span>
        ) : null,
    },
    {
      id: 'expense',
      accessorFn: (row) => (isIncome(row.amount) ? '' : absAmount(row.amount)),
      ...titled('Egreso'),
      cell: ({ row }) =>
        isIncome(row.original.amount) ? null : (
          <span
            className={
              row.original.cancelled
                ? 'tabular-nums text-muted-foreground line-through'
                : 'tabular-nums text-destructive'
            }
          >
            {formatMoney(absAmount(row.original.amount))}
          </span>
        ),
    },
    {
      id: 'state',
      // El export toma este valor: un movimiento vigente y conciliado lo dice explicitamente
      accessorFn: (row) =>
        row.cancelled
          ? MOVEMENT_STATE_LABELS.CANCELLED
          : row.reconciled
            ? `${MOVEMENT_STATE_LABELS.ACTIVE} - Conciliado`
            : MOVEMENT_STATE_LABELS.ACTIVE,
      ...titled('Estado'),
      cell: ({ row }) => {
        const key = row.original.cancelled ? 'CANCELLED' : 'ACTIVE';
        return (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              <TreasuryStatusBadge ui={MOVEMENT_STATE_UI[key]} />
              {!row.original.cancelled && row.original.reconciled && (
                <TreasuryStatusBadge ui={MOVEMENT_STATE_UI.RECONCILED} title="Conciliado con el extracto" />
              )}
            </div>
            {row.original.cancelled && row.original.cancel_reason && (
              <p className="max-w-xs text-xs text-muted-foreground">{row.original.cancel_reason}</p>
            )}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        if (row.original.cancelled) return value.includes('CANCELLED');
        // Vigente incluye al conciliado; "Conciliado" es el subconjunto con línea de extracto
        return value.includes('ACTIVE') || (row.original.reconciled && value.includes('RECONCILED'));
      },
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
      ...titled('Fecha de alta'),
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
        <MovementRowActions
          movement={{
            id: row.original.id,
            kind: row.original.kind,
            cancelled: row.original.cancelled,
            reconciled: row.original.reconciled,
            accountName: row.original.account.name,
          }}
          accounts={accounts}
          concepts={concepts}
        />
      ),
    });
  }

  return columns;
}
