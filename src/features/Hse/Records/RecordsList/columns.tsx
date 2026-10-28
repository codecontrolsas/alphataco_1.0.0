'use client';

import { matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { HseStatusBadge } from '../../components/HseStatusBadge';
import { HSE_RECORD_MODALITY_LABELS, HSE_RECORD_STATUS_LABELS } from '../../lib/pdf-content';
import { HSE_RECORD_STATUS_UI } from '../../lib/status-presentation';
import type { HseRecordListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['location', 'closed_at'];

export const STATUS_VALUES = Object.keys(HSE_RECORD_STATUS_LABELS) as (keyof typeof HSE_RECORD_STATUS_LABELS)[];
export const MODALITY_VALUES = Object.keys(HSE_RECORD_MODALITY_LABELS) as (keyof typeof HSE_RECORD_MODALITY_LABELS)[];

export function getColumns(): ColumnDef<HseRecordListItem>[] {
  return [
    {
      id: 'number',
      accessorKey: 'number',
      ...titled('N°'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/hse/records/${row.original.id}?tab=actas`}
          className="text-brand-ink focus-visible:ring-ring rounded-sm font-medium tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-2"
          aria-label={`Ver el acta ${row.original.number} de ${row.original.training.title}`}
        >
          Acta {row.original.number}
        </Link>
      ),
    },
    {
      id: 'training',
      accessorFn: (row) => row.training.title,
      ...titled('Capacitación'),
      cell: ({ row }) => <span className="break-words">{row.original.training.title}</span>,
    },
    {
      id: 'held_on',
      accessorKey: 'held_on',
      ...titled('Fecha'),
      cell: ({ row }) => <span className="tabular-nums">{formatDateAr(row.original.held_on)}</span>,
    },
    {
      id: 'modality',
      accessorFn: (row) => HSE_RECORD_MODALITY_LABELS[row.modality],
      ...titled('Modalidad'),
      filterFn: matchesId((r) => r.modality),
    },
    {
      id: 'location',
      accessorFn: (row) => row.location ?? '',
      ...titled('Lugar'),
      cell: ({ row }) => row.original.location ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'attendees',
      accessorKey: 'attendees',
      ...titled('Presentes'),
      cell: ({ row }) => <span className="tabular-nums">{row.original.attendees}</span>,
    },
    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => <HseStatusBadge ui={HSE_RECORD_STATUS_UI[row.original.status]} />,
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'closed_at',
      accessorKey: 'closed_at',
      ...titled('Cerrada'),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.closed_at ? formatArgentinaDateTime(row.original.closed_at) : '-'}
        </span>
      ),
    },
  ];
}
