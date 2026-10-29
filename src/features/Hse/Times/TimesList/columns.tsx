'use client';

import { Badge } from '@/components/ui/badge';
import { matchesId, matchesNullableId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { HseStatusBadge } from '../../components/HseStatusBadge';
import { formatDuration } from '../../lib/durations';
import { HSE_ASSIGNMENT_STATUS_UI } from '../../lib/status-presentation';
import type { HseTimesItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['position', 'exam_total_seconds'];

export const attemptsLabel = (row: HseTimesItem) => `${row.attempts_used} de ${row.max_attempts}`;

/** "12 min 30 s" o "Sin medición"; el estudio aclara cuántos materiales se pudieron medir. */
export const studyLabel = (row: HseTimesItem) =>
  row.study_seconds === null
    ? 'Sin medición'
    : `${formatDuration(row.study_seconds)} (${row.study_measured} de ${row.study_total} material${row.study_total === 1 ? '' : 'es'})`;

const NO_DATA = <span className="text-muted-foreground">Sin medición</span>;

/** Legajo en columna propia, ANTES del nombre (regla del legajo). */
export function getColumns(): ColumnDef<HseTimesItem>[] {
  return [
    {
      id: 'file',
      accessorFn: (row) => row.employee.file,
      ...titled('Legajo'),
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.employee.file}</span>,
    },
    {
      id: 'employee',
      accessorFn: (row) => row.employee.name,
      ...titled('Empleado'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span>{row.original.employee.name}</span>
          {!row.original.employee.isActive && <Badge variant="outline">De baja</Badge>}
        </div>
      ),
    },
    {
      id: 'position',
      accessorFn: (row) => row.position?.name ?? 'Sin puesto',
      ...titled('Puesto'),
      cell: ({ row }) => (
        <span>{row.original.position?.name ?? <span className="text-muted-foreground">Sin puesto</span>}</span>
      ),
      filterFn: matchesNullableId((r) => r.position?.id),
    },
    {
      id: 'training',
      accessorFn: (row) => row.training.title,
      ...titled('Capacitación'),
      cell: ({ row }) => <span className="text-pretty">{row.original.training.title}</span>,
      filterFn: matchesId((r) => r.training.id),
    },
    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => <HseStatusBadge ui={HSE_ASSIGNMENT_STATUS_UI[row.original.status]} />,
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'study_seconds',
      accessorFn: studyLabel,
      ...titled('Tiempo de estudio'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.study_seconds === null ? (
          NO_DATA
        ) : (
          <span className="tabular-nums">
            {formatDuration(row.original.study_seconds)}
            <span className="text-muted-foreground text-xs">
              {' '}
              ({row.original.study_measured} de {row.original.study_total})
            </span>
          </span>
        ),
    },
    {
      id: 'exam_last_seconds',
      accessorFn: (row) => formatDuration(row.exam_last_seconds),
      ...titled('Examen (último intento)'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.exam_last_seconds === null ? (
          NO_DATA
        ) : (
          <span className="tabular-nums">{formatDuration(row.original.exam_last_seconds)}</span>
        ),
    },
    {
      id: 'exam_total_seconds',
      accessorFn: (row) => formatDuration(row.exam_total_seconds),
      ...titled('Examen (total)'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.exam_total_seconds === null ? (
          NO_DATA
        ) : (
          <span className="tabular-nums">{formatDuration(row.original.exam_total_seconds)}</span>
        ),
    },
    {
      id: 'attempts_used',
      accessorFn: attemptsLabel,
      ...titled('Intentos'),
      cell: ({ row }) => <span className="tabular-nums">{attemptsLabel(row.original)}</span>,
    },
    {
      id: 'last_attempt_at',
      accessorKey: 'last_attempt_at',
      ...titled('Último intento'),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.last_attempt_at ? formatArgentinaDateTime(row.original.last_attempt_at) : '-'}
        </span>
      ),
    },
  ];
}
