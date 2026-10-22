'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { conditionLabels, employeeStatusBadges, otherEquipmentStatusLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { conditionIcons, conditionVariants, documentStatusIcons } from '../lib/status-config';
import type { CustomerEquipmentItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT = ['year', 'brand', 'model'];

const EMPTY = <span className="text-muted-foreground">-</span>;

/** Filtro de columna facetada con FK nullable: `NULL_FILTER_VALUE` selecciona los vacíos. */
function relationFilter(pick: (row: CustomerEquipmentItem) => string | number | null | undefined) {
  return (row: { original: CustomerEquipmentItem }, _id: string, value: string[]) => {
    const id = pick(row.original);
    if (id == null) return value.includes(NULL_FILTER_VALUE);
    return value.includes(String(id));
  };
}

export const columns: ColumnDef<CustomerEquipmentItem>[] = [
  {
    accessorKey: 'intern_number',
    meta: { title: 'Número interno' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Número interno" />,
    cell: ({ row }) => {
      const { id, intern_number } = row.original;
      if (!intern_number) return EMPTY;
      return (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${id}`}
          className="focus-visible:ring-ring/50 rounded-sm font-mono font-medium tabular-nums outline-none hover:underline focus-visible:ring-[3px]"
        >
          {intern_number}
        </Link>
      );
    },
  },
  {
    accessorKey: 'domain',
    meta: { title: 'Dominio' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dominio" />,
    cell: ({ row }) => {
      const { id, domain } = row.original;
      if (!domain) return EMPTY;
      return (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${id}`}
          className="focus-visible:ring-ring/50 rounded-sm font-mono font-medium outline-none hover:underline focus-visible:ring-[3px]"
        >
          {domain}
        </Link>
      );
    },
  },
  {
    id: 'type',
    accessorFn: (row) => row.type_vehicles_typeTotype?.name ?? '',
    meta: { title: 'Tipo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
    cell: ({ row }) => row.original.type_vehicles_typeTotype?.name || EMPTY,
    filterFn: relationFilter((row) => row.type_vehicles_typeTotype?.id),
  },
  {
    id: 'brand',
    accessorFn: (row) => row.brand_vehicles?.name ?? '',
    meta: { title: 'Marca' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Marca" />,
    cell: ({ row }) => row.original.brand_vehicles?.name || EMPTY,
    filterFn: relationFilter((row) => row.brand_vehicles?.id),
  },
  {
    id: 'model',
    accessorFn: (row) => row.model_vehicles?.name ?? '',
    meta: { title: 'Modelo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Modelo" />,
    cell: ({ row }) => row.original.model_vehicles?.name || EMPTY,
    filterFn: relationFilter((row) => row.model_vehicles?.id),
  },
  {
    accessorKey: 'year',
    meta: { title: 'Año' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Año" />,
    cell: ({ row }) => <span className="tabular-nums">{row.original.year}</span>,
  },
  {
    accessorKey: 'condition',
    meta: { title: 'Condición' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Condición" />,
    cell: ({ row }) => {
      const condition = row.original.condition;
      if (!condition) return EMPTY;
      const Icon = conditionIcons[condition];
      return (
        <Badge variant={conditionVariants[condition] ?? 'default'}>
          {Icon ? <Icon aria-hidden="true" /> : null}
          {conditionLabels[condition] ?? condition}
        </Badge>
      );
    },
    filterFn: (row, id, value: string[]) => {
      const current = row.getValue(id) as string | null;
      if (current == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(current);
    },
  },
  {
    accessorKey: 'status',
    meta: { title: 'Estado documental' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado documental" />,
    cell: ({ row }) => {
      const status = row.original.status;
      if (!status) return EMPTY;
      const Icon = documentStatusIcons[status];
      return (
        <Badge variant={employeeStatusBadges[status] ?? 'default'}>
          {Icon ? <Icon aria-hidden="true" /> : null}
          {otherEquipmentStatusLabels[status] ?? status}
        </Badge>
      );
    },
    filterFn: (row, id, value: string[]) => {
      const current = row.getValue(id) as string | null;
      if (current == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(current);
    },
  },
  {
    accessorKey: 'is_active',
    meta: { title: 'Situación' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Situación" />,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.is_active === false ? (
        <Badge variant="secondary">
          <X aria-hidden="true" />
          Dado de baja
        </Badge>
      ) : (
        <Badge variant="success">
          <Check aria-hidden="true" />
          Activo
        </Badge>
      ),
    filterFn: (row, id, value: string[]) => {
      const current = row.getValue(id) as boolean | null;
      if (current == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(current));
    },
  },
  {
    // Fecha de la afectación a este cliente (no se ordena: está en la pivote, una relación 1:N).
    accessorKey: 'affected_since',
    meta: { title: 'Afectado desde' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Afectado desde" />,
    enableSorting: false,
    cell: ({ row }) => (row.original.affected_since ? formatArgentinaDay(row.original.affected_since) : EMPTY),
  },
];
