'use client';

import { Badge } from '@/components/ui/badge';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { employeeStatusBadges, employeeStatusLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { documentStatusIcons } from '../lib/status-config';
import type { CustomerEmployeeItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  'cuil',
  'document_number',
  'hierarchical_position',
  'type_of_contract',
  'date_of_admission',
  'phone',
  'email',
];

const EMPTY = <span className="text-muted-foreground">-</span>;

/** `date_of_admission` es `@db.Date`: llega como medianoche UTC, se lee en UTC para no correr el día. */
export function formatDbDate(value: unknown): string {
  return value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : '';
}

/** Filtro de columna facetada con FK nullable: `NULL_FILTER_VALUE` selecciona los vacíos. */
function relationFilter(pick: (row: CustomerEmployeeItem) => string | null | undefined) {
  return (row: { original: CustomerEmployeeItem }, _id: string, value: string[]) => {
    const id = pick(row.original);
    if (id == null) return value.includes(NULL_FILTER_VALUE);
    return value.includes(id);
  };
}

export const columns: ColumnDef<CustomerEmployeeItem>[] = [
  {
    // El legajo identifica al empleado (el nombre puede repetirse): columna propia, antes del nombre.
    accessorKey: 'file',
    ...titled('Legajo'),
    cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.file}</span>,
  },
  {
    id: 'fullname',
    accessorFn: (row) => `${row.lastname} ${row.firstname}`,
    ...titled('Apellido y nombre'),
    cell: ({ row }) => (
      <Link
        href={`/dashboard/employee/action?action=view&employee_id=${row.original.id}`}
        className="focus-visible:ring-ring/50 rounded-sm font-medium outline-none hover:underline focus-visible:ring-[3px]"
      >
        {row.original.lastname} {row.original.firstname}
      </Link>
    ),
  },
  {
    id: 'company_position',
    accessorFn: (row) => row.company_positions?.name ?? '',
    ...titled('Puesto'),
    cell: ({ row }) => row.original.company_positions?.name || EMPTY,
    filterFn: relationFilter((row) => row.company_positions?.id),
  },
  {
    id: 'hierarchical_position',
    accessorFn: (row) => row.hierarchy?.name ?? '',
    ...titled('Sector'),
    cell: ({ row }) => row.original.hierarchy?.name || EMPTY,
    filterFn: relationFilter((row) => row.hierarchy?.id),
  },
  {
    id: 'type_of_contract',
    accessorFn: (row) => row.types_of_contract?.name ?? '',
    ...titled('Tipo de contrato'),
    cell: ({ row }) => row.original.types_of_contract?.name || EMPTY,
    filterFn: relationFilter((row) => row.types_of_contract?.id),
  },
  {
    accessorKey: 'status',
    ...titled('Estado documental'),
    cell: ({ row }) => {
      const status = row.original.status;
      if (!status) return EMPTY;
      const Icon = documentStatusIcons[status];
      return (
        <Badge variant={employeeStatusBadges[status] ?? 'default'}>
          {Icon ? <Icon aria-hidden="true" /> : null}
          {employeeStatusLabels[status] ?? status}
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
    ...titled('Situación'),
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
    accessorKey: 'cuil',
    ...titled('CUIL'),
    cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.cuil}</span>,
  },
  {
    accessorKey: 'document_number',
    ...titled('Documento'),
    cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.document_number}</span>,
  },
  {
    accessorKey: 'date_of_admission',
    ...titled('Fecha de ingreso'),
    cell: ({ row }) => formatDbDate(row.original.date_of_admission),
  },
  {
    // Fecha de la afectación a este cliente (no se ordena: está en la pivote, una relación 1:N).
    accessorKey: 'affected_since',
    ...titled('Afectado desde'),
    enableSorting: false,
    cell: ({ row }) => (row.original.affected_since ? formatArgentinaDay(row.original.affected_since) : EMPTY),
  },
  {
    accessorKey: 'phone',
    ...titled('Teléfono'),
    cell: ({ row }) => row.original.phone || EMPTY,
  },
  {
    accessorKey: 'email',
    ...titled('Email'),
    cell: ({ row }) => row.original.email || EMPTY,
  },
];
