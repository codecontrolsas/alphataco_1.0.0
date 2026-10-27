'use client';

import { matchesId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { HseStatusBadge } from '../../components/HseStatusBadge';
import { TrainingProgressBar } from '../../components/TrainingProgressBar';
import { HSE_TRAINING_KIND_LABELS, HSE_TRAINING_STATUS_LABELS } from '../../lib/constants';
import { HSE_TRAINING_STATUS_UI } from '../../lib/status-presentation';
import type { HseTrainingListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['updated_at', 'published_at'];

export const STATUS_VALUES = Object.keys(HSE_TRAINING_STATUS_LABELS) as (keyof typeof HSE_TRAINING_STATUS_LABELS)[];
export const KIND_VALUES = Object.keys(HSE_TRAINING_KIND_LABELS) as (keyof typeof HSE_TRAINING_KIND_LABELS)[];

/** Avance como texto (export y filtro): coincide con las etiquetas del filtro. */
export function progressLabel(row: HseTrainingListItem): string {
  if (row.progress.total === 0) return 'Sin asignar';
  return `${row.progress.passed}/${row.progress.total} aprobaron`;
}

function progressKey(row: HseTrainingListItem): string {
  if (row.progress.total === 0) return 'none';
  return row.progress.passed < row.progress.total ? 'with_pending' : 'complete';
}

/** Configuración del examen en una línea: aprobación, intentos y tiempo. */
export function examLabel(row: HseTrainingListItem): string {
  const time = row.time_limit_minutes ? `${row.time_limit_minutes} min` : 'sin límite de tiempo';
  return `${row.passing_score} % · ${row.max_attempts} intento${row.max_attempts === 1 ? '' : 's'} · ${time}`;
}

export function getColumns(): ColumnDef<HseTrainingListItem>[] {
  return [
    {
      id: 'title',
      accessorKey: 'title',
      ...titled('Capacitación'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/hse/trainings/${row.original.id}`}
          className="font-medium text-brand-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      id: 'kind',
      accessorFn: (row) => HSE_TRAINING_KIND_LABELS[row.kind],
      ...titled('Tipo'),
      filterFn: matchesId((r) => r.kind),
    },
    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => <HseStatusBadge ui={HSE_TRAINING_STATUS_UI[row.original.status]} />,
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'progress',
      accessorFn: progressLabel,
      ...titled('Avance'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.status === 'draft' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <TrainingProgressBar passed={row.original.progress.passed} total={row.original.progress.total} />
        ),
      filterFn: matchesId(progressKey),
    },
    {
      id: 'passing_score',
      accessorFn: examLabel,
      ...titled('Examen'),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.questions} pregunta{row.original.questions === 1 ? '' : 's'} · {examLabel(row.original)}
        </span>
      ),
    },
    {
      id: 'published_at',
      accessorKey: 'published_at',
      ...titled('Publicada'),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.published_at ? formatArgentinaDay(row.original.published_at) : '-'}
        </span>
      ),
    },
    {
      id: 'updated_at',
      accessorKey: 'updated_at',
      ...titled('Actualizada'),
      cell: ({ row }) => <span className="tabular-nums">{formatArgentinaDateTime(row.original.updated_at)}</span>,
    },
  ];
}
