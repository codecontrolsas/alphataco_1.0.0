'use client';

import { matchesId, matchesNullableId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import Link from 'next/link';
import { ComplianceBar } from '../../components/ComplianceBar';
import { HseExpiredBadge, HseStatusBadge } from '../../components/HseStatusBadge';
import { HSE_DOCUMENT_STATUS_LABELS } from '../../lib/constants';
import { HSE_DOCUMENT_STATUS_UI } from '../../lib/status-presentation';
import type { HseDocumentListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['updated_at', 'targets'];

/** Día `YYYY-MM-DD` (columna @db.Date) tal cual, sin correr zona horaria. */
export const formatDay = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-';

/** Cumplimiento como texto (export y filtro): coincide con las etiquetas del filtro. */
export function complianceLabel(row: HseDocumentListItem): string {
  if (!row.compliance) return '-';
  const total = row.compliance.pending + row.compliance.accepted + row.compliance.rejected;
  if (total === 0) return 'Sin destinatarios';
  return `${row.compliance.accepted}/${total} aceptaron${row.compliance.pending ? `, ${row.compliance.pending} pendientes` : ''}`;
}

function complianceKey(row: HseDocumentListItem): string {
  if (!row.compliance) return 'none';
  const total = row.compliance.pending + row.compliance.accepted + row.compliance.rejected;
  if (total === 0) return 'none';
  return row.compliance.pending > 0 ? 'with_pending' : 'complete';
}

export function getColumns(): ColumnDef<HseDocumentListItem>[] {
  return [
    {
      id: 'title',
      accessorKey: 'title',
      ...titled('Documento'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/hse/documents/${row.original.id}`}
          className="font-medium text-brand-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      id: 'type',
      accessorFn: (row) => row.type?.name ?? 'Sin tipo',
      ...titled('Tipo'),
      cell: ({ row }) => (
        <span>{row.original.type?.name ?? <span className="text-muted-foreground">Sin tipo</span>}</span>
      ),
      filterFn: matchesNullableId((r) => r.type?.id),
    },
    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => <HseStatusBadge ui={HSE_DOCUMENT_STATUS_UI[row.original.status]} />,
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'version',
      accessorKey: 'version',
      ...titled('Versión'),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.version ? `v${row.original.version}` : '-'}</span>
      ),
    },
    {
      id: 'compliance',
      accessorFn: complianceLabel,
      ...titled('Cumplimiento'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.status !== 'published' || !row.original.compliance ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <ComplianceBar compliance={row.original.compliance} />
        ),
      filterFn: matchesId(complianceKey),
    },
    {
      id: 'expires_at',
      accessorKey: 'expires_at',
      ...titled('Vence'),
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tabular-nums">{formatDay(row.original.expires_at)}</span>
          {row.original.expired && <HseExpiredBadge />}
        </div>
      ),
    },
    {
      id: 'targets',
      accessorKey: 'targets',
      ...titled('Destinatarios'),
      enableSorting: false,
      cell: ({ row }) => <span className="tabular-nums">{row.original.targets}</span>,
    },
    {
      id: 'updated_at',
      accessorKey: 'updated_at',
      ...titled('Actualizado'),
      cell: ({ row }) => <span className="tabular-nums">{formatArgentinaDateTime(row.original.updated_at)}</span>,
    },
  ];
}

export const STATUS_VALUES = Object.keys(HSE_DOCUMENT_STATUS_LABELS) as (keyof typeof HSE_DOCUMENT_STATUS_LABELS)[];
