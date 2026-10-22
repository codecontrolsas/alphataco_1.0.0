'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { destinationTypeIcons } from '@/features/Warehouses/Movements/components/MovementsList/columns';
import { DESTINATION_TYPE_LABELS } from '@/features/Warehouses/lib/labels';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { PurchaseRequestStatusBadge } from '../components/PurchaseRequestStatusBadge';
import type { PurchaseRequestListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

export function getColumns(): ColumnDef<PurchaseRequestListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/purchases/requests/${row.original.id}`}
          className="font-mono text-sm font-medium text-brand-ink hover:underline"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => <span>{formatArgentinaDay(row.original.created_at)}</span>,
    },
    {
      id: 'requester',
      accessorFn: (row) => row.requester.name,
      meta: { title: 'Solicitante' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Solicitante" />,
      cell: ({ row }) => <StackedCell primary={row.original.requester.name} secondary={row.original.requester.email} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.requester.id),
    },
    {
      id: 'destination_type',
      // Sin destino la solicitud es para reponer stock: se exporta y se muestra "Para stock".
      accessorFn: (row) => (row.destination_type ? DESTINATION_TYPE_LABELS[row.destination_type] : 'Para stock'),
      meta: { title: 'Tipo de destino' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de destino" />,
      cell: ({ row }) => {
        const t = row.original.destination_type;
        if (!t) return <Badge variant="secondary">Para stock</Badge>;
        const Icon = destinationTypeIcons[t];
        return (
          <Badge variant="outline" className="gap-1">
            <Icon className="h-3 w-3" />
            {DESTINATION_TYPE_LABELS[t]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.destination_type;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },
    {
      id: 'destination',
      accessorFn: (row) => row.destination ?? '',
      meta: { title: 'Destino' },
      // Calculado desde varias relaciones (empleado/equipo/orden/cliente): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Destino" />,
      cell: ({ row }) => <StackedCell primary={row.original.destination ?? '-'} maxWidthClass="max-w-[260px]" />,
    },
    {
      id: 'status',
      accessorKey: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <PurchaseRequestStatusBadge status={row.original.status} />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },
    {
      id: 'lines_count',
      accessorKey: 'lines_count',
      meta: { title: 'Líneas' },
      // Conteo derivado (no es un campo de la base): sin filtro.
      header: ({ column }) => <DataTableColumnHeader column={column} title="Líneas" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.lines_count}</span>,
    },
    {
      id: 'progress',
      accessorFn: (row) => (row.progress == null ? '' : `${row.progress}%`),
      meta: { title: 'Avance' },
      // Derivado de las OC (no es campo de la base): sin orden ni filtro server-side. El estado ya filtra el avance.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Avance" />,
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.progress == null ? '—' : `${row.original.progress}%`}</span>
      ),
    },
    {
      id: 'needed_by',
      accessorFn: (row) => row.needed_by,
      meta: { title: 'Se necesita para' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Se necesita para" />,
      cell: ({ row }) => (
        <span>{row.original.needed_by ? formatDateAr(new Date(row.original.needed_by).toISOString().slice(0, 10)) : '-'}</span>
      ),
    },
    {
      id: 'material_request',
      accessorFn: (row) => row.material_request?.number ?? '',
      meta: { title: 'Pedido de origen' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pedido de origen" />,
      cell: ({ row }) => {
        const origin = row.original.material_request;
        if (!origin) return <span>-</span>;
        return (
          <Link
            href={`/dashboard/warehouse/requests/${origin.id}`}
            className="font-mono text-sm text-brand-ink hover:underline"
          >
            {origin.number}
          </Link>
        );
      },
    },
  ];
}
