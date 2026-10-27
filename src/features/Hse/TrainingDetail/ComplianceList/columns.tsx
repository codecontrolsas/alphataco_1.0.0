'use client';

import { Badge } from '@/components/ui/badge';
import { matchesId, matchesNullableId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { HseStatusBadge } from '../../components/HseStatusBadge';
import { HSE_ASSIGNMENT_STATUS_UI } from '../../lib/status-presentation';
import { formatPercent } from '../../lib/training-status';
import type { HseTrainingComplianceItem } from './actions.server';
import { EmployeeAttemptsButton } from './components/EmployeeAttemptsButton';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['position'];

/** Día `YYYY-MM-DD` (columna @db.Date) tal cual, sin correr zona horaria. */
export const formatDay = (value: string | null | undefined) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-';

export const attemptsLabel = (row: HseTrainingComplianceItem) => `${row.attempts_used} de ${row.max_attempts}`;

/** Legajo en columna propia, ANTES del nombre (regla del legajo). */
export function getColumns(trainingId: string): ColumnDef<HseTrainingComplianceItem>[] {
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
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => <HseStatusBadge ui={HSE_ASSIGNMENT_STATUS_UI[row.original.status]} />,
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'attempts_used',
      accessorFn: attemptsLabel,
      ...titled('Intentos'),
      cell: ({ row }) => <span className="tabular-nums">{attemptsLabel(row.original)}</span>,
    },
    {
      id: 'last_score_percent',
      accessorFn: (row) => formatPercent(row.last_score_percent),
      ...titled('Último puntaje'),
      cell: ({ row }) => <span className="tabular-nums">{formatPercent(row.original.last_score_percent)}</span>,
    },
    {
      id: 'passed_at',
      accessorKey: 'passed_at',
      ...titled('Aprobó el'),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.passed_at ? formatArgentinaDay(row.original.passed_at) : '-'}
        </span>
      ),
    },
    {
      id: 'valid_until',
      accessorKey: 'valid_until',
      ...titled('Vigente hasta'),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.passed_at && !row.original.valid_until
            ? 'Sin vencimiento'
            : formatDay(row.original.valid_until)}
        </span>
      ),
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) =>
        row.original.attempts_total > 0 ? (
          <EmployeeAttemptsButton
            trainingId={trainingId}
            employeeId={row.original.employee.id}
            employeeLabel={`[${row.original.employee.file}] ${row.original.employee.name}`}
          />
        ) : null,
    },
  ];
}
