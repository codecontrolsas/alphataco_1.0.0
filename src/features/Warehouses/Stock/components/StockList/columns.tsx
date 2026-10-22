'use client';

import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { argentinaDate, formatDateAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { WarehouseStatusBadge } from '../../../components/WarehouseStatusBadge';
import { classifyBatch, dateColumnToYmd } from '../../../lib/batch-expiry';
import { formatMoney, formatQuantity, formatUnitCost } from '../../../lib/format';
import { STOCK_LEVEL_UI } from '../../../lib/status-presentation';
import type { StockListItem } from './actions.server';

/**
 * Nivel de stock del material en el filtro y el export: `true` = bajo mínimo, `false` = en stock. La tabla
 * solo lista saldos con cantidad > 0, así que "Agotado" no aparece acá (vive en Materiales).
 */
export const stockLevelByBelowMin = { true: STOCK_LEVEL_UI.BELOW_MIN, false: STOCK_LEVEL_UI.OK } as const;

/** Vencimiento de un `@db.Date` (medianoche UTC) como `DD/MM/YYYY`, sin correr el día. */
export function formatBatchExpiry(value: string | Date | null | undefined): string {
  if (!value) return '';
  return formatDateAr(dateColumnToYmd(new Date(value)));
}

export const HIDDEN_COLUMNS_BY_DEFAULT = ['category'];

interface StockColumnsOptions {
  canViewPrices: boolean;
}

export function getColumns({ canViewPrices }: StockColumnsOptions): ColumnDef<StockListItem>[] {
  const today = argentinaDate();
  const columns: ColumnDef<StockListItem>[] = [
    {
      id: 'code',
      accessorFn: (row) => row.material.code,
      ...titled('Código'),
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.material.code}</span>,
    },
    {
      id: 'material',
      accessorFn: (row) => row.material.name,
      ...titled('Material'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/warehouse/materials/${row.original.material.id}`}
          className="text-brand-ink font-medium hover:underline focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px]"
        >
          {row.original.material.name}
        </Link>
      ),
    },
    {
      id: 'category',
      accessorFn: (row) => row.material.category?.name ?? '',
      ...titled('Categoría'),
      cell: ({ row }) => <span>{row.original.material.category?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.material.category?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'warehouse',
      accessorFn: (row) => row.warehouse.name,
      ...titled('Depósito'),
      cell: ({ row }) => <span>{row.original.warehouse.name}</span>,
      filterFn: matchesId((r) => r.warehouse.id),
    },
    {
      id: 'batch',
      accessorFn: (row) => row.batch?.batch_number ?? '',
      ...titled('Lote'),
      cell: ({ row }) => <span>{row.original.batch?.batch_number ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.batch?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'expires_at',
      // Date | null: el formatter de export lo pasa a DD/MM/YYYY
      accessorFn: (row) => row.batch?.expires_at ?? null,
      ...titled('Vencimiento'),
      cell: ({ row }) => {
        const exp = row.original.batch?.expires_at;
        if (!exp) return <span>-</span>;
        const ymd = dateColumnToYmd(new Date(exp));
        const status = classifyBatch(ymd, today);
        return (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{formatDateAr(ymd)}</span>
            {status !== 'OK' && <WarehouseStatusBadge entity="batchExpiry" status={status} size="sm" />}
          </span>
        );
      },
    },
    {
      id: 'quantity',
      accessorFn: (row) => Number(row.quantity),
      ...titled('Cantidad'),
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatQuantity(row.original.quantity)}</span>,
    },
    {
      id: 'unit',
      accessorFn: (row) => row.material.unit.name,
      ...titled('Unidad'),
      cell: ({ row }) => <span>{row.original.material.unit.name}</span>,
      filterFn: matchesId((r) => r.material.unit.id),
    },
    {
      id: 'below_min',
      accessorFn: (row) => row.below_min,
      meta: { title: 'Nivel de stock' },
      // Calculado (suma de todos los saldos del material vs min_stock): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nivel de stock" />,
      cell: ({ row }) => (
        <WarehouseStatusBadge entity="stockLevel" status={row.original.below_min ? 'BELOW_MIN' : 'OK'} size="sm" />
      ),
      filterFn: matchesId((r) => r.below_min),
    },
  ];

  if (canViewPrices) {
    columns.push(
      {
        id: 'average_cost',
        accessorFn: (row) => (row.average_cost != null ? Number(row.average_cost) : null),
        ...titled('Costo promedio'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.average_cost != null ? formatUnitCost(row.original.average_cost) : '-'}
          </span>
        ),
      },
      {
        id: 'valued',
        accessorFn: (row) => (row.valued != null ? Number(row.valued) : null),
        meta: { title: 'Valorizado' },
        // Calculado (cantidad x costo promedio): no se puede ordenar server-side.
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Valorizado" />,
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {row.original.valued != null ? formatMoney(row.original.valued) : '-'}
          </span>
        ),
      }
    );
  }

  return columns;
}
