'use client';

import { Button } from '@/components/ui/button';
import type { certification_status } from '@/generated/prisma/enums';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { Eye } from 'lucide-react';
import moment from 'moment';
import { CERTIFICATION_STATUS_UI } from '../../lib/status-presentation';
import { CertificationAmount } from '../components/CertificationAmount';
import { CertificationStatusBadge } from '../components/CertificationStatusBadge';
import { CERTIFICATION_STATUS_LABELS } from '../lib/state-machine';
import type { CertificationListItem } from './actions.server';

// ============================================================================
// CONSTANTS (compartidas con el filtro y el export)
// ============================================================================

/** Columnas secundarias: ocultas por defecto. */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'currency',
  'notes',
  'issued_at',
  'confirmed_at',
  'voided_at',
  'voided_reason',
  'created_at',
];

/** Mismos iconos en el filtro y en la celda (el badge los toma de la misma fuente). */
export const statusIcons: Record<certification_status, LucideIcon> = {
  borrador: CERTIFICATION_STATUS_UI.borrador.icon,
  emitida: CERTIFICATION_STATUS_UI.emitida.icon,
  confirmada: CERTIFICATION_STATUS_UI.confirmada.icon,
  anulada: CERTIFICATION_STATUS_UI.anulada.icon,
  facturada: CERTIFICATION_STATUS_UI.facturada.icon,
};

export const formatDateOnly = (value: string) => moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');

const periodLabel = (row: CertificationListItem) =>
  `${formatDateOnly(row.periodFrom)} — ${formatDateOnly(row.periodTo)}`;

const contractLabel = (row: CertificationListItem) => row.contract.name ?? 'Sin nombre';

// ============================================================================
// COLUMNS
// ============================================================================

export function getCertificationColumns({
  canViewPrices,
  onOpenDetail,
}: {
  canViewPrices: boolean;
  onOpenDetail: (id: string) => void;
}): ColumnDef<CertificationListItem>[] {
  const timestampColumn = (
    id: 'issued_at' | 'confirmed_at' | 'voided_at' | 'created_at',
    title: string,
    pick: (row: CertificationListItem) => string | null
  ): ColumnDef<CertificationListItem> => ({
    id,
    accessorFn: (row) => pick(row) ?? '',
    meta: { title },
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ row }) => {
      const value = pick(row.original);
      return <span className="whitespace-nowrap tabular-nums">{value ? formatArgentinaDateTime(value) : '—'}</span>;
    },
  });

  const columns: ColumnDef<CertificationListItem>[] = [
    {
      id: 'number',
      accessorFn: (row) => row.number,
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => <span className="font-mono text-sm whitespace-nowrap">{row.original.number}</span>,
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
      id: 'contract',
      accessorFn: (row) => contractLabel(row),
      meta: { title: 'Contrato' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contrato" />,
      cell: ({ row }) => (
        <span>
          {contractLabel(row.original)}
          {row.original.contract.number ? (
            <span className="text-muted-foreground"> · N° {row.original.contract.number}</span>
          ) : null}
        </span>
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.contract.id),
    },
    {
      id: 'period',
      accessorFn: (row) => periodLabel(row),
      meta: { title: 'Período' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Período" />,
      cell: ({ row }) => <span className="text-sm whitespace-nowrap tabular-nums">{periodLabel(row.original)}</span>,
    },
    {
      id: 'status',
      accessorFn: (row) => CERTIFICATION_STATUS_LABELS[row.status],
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <CertificationStatusBadge status={row.original.status} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },
    {
      id: 'lines',
      accessorFn: (row) => row.linesCount,
      meta: { title: 'Líneas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Líneas" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.linesCount}</span>,
    },
  ];

  if (canViewPrices) {
    columns.push({
      id: 'total',
      accessorFn: (row) => row.total ?? '',
      meta: { title: 'Total' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => (
        <div className="text-right">
          <CertificationAmount value={row.original.total} currency={row.original.currency} />
        </div>
      ),
    });
  }

  columns.push(
    {
      id: 'currency',
      accessorFn: (row) => row.currency,
      meta: { title: 'Moneda' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Moneda" />,
      cell: ({ row }) => <span>{row.original.currency}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.currency),
    },
    {
      id: 'notes',
      accessorFn: (row) => row.notes ?? '',
      meta: { title: 'Observaciones' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Observaciones" />,
      cell: ({ row }) => <span className="line-clamp-2 max-w-72 text-sm break-words">{row.original.notes ?? '—'}</span>,
    },
    timestampColumn('issued_at', 'Emitida', (row) => row.issuedAt),
    timestampColumn('confirmed_at', 'Confirmada', (row) => row.confirmedAt),
    timestampColumn('voided_at', 'Anulada', (row) => row.voidedAt),
    {
      id: 'voided_reason',
      accessorFn: (row) => row.voidedReason ?? '',
      meta: { title: 'Motivo de anulación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo de anulación" />,
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-72 text-sm break-words">{row.original.voidedReason ?? '—'}</span>
      ),
    },
    timestampColumn('created_at', 'Fecha de creación', (row) => row.createdAt),
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Ver certificación ${row.original.number}`}
          onClick={() => onOpenDetail(row.original.id)}
        >
          <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Ver
        </Button>
      ),
    }
  );

  return columns;
}
