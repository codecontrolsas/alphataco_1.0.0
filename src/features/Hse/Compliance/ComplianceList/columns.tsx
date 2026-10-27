'use client';

import { Badge } from '@/components/ui/badge';
import { matchesId, matchesNullableId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { HseStatusBadge } from '../../components/HseStatusBadge';
import { HSE_ACK_STATUS_UI } from '../../lib/status-presentation';
import type { HseComplianceListItem } from './actions.server';

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['reject_reason', 'created_at'];

/** Legajo en columna propia, ANTES del nombre (regla del legajo). */
export function getColumns({ showDocument }: { showDocument: boolean }): ColumnDef<HseComplianceListItem>[] {
  const columns: ColumnDef<HseComplianceListItem>[] = [
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
  ];
  if (showDocument) {
    columns.push({
      id: 'document',
      accessorFn: (row) => row.document.title,
      ...titled('Documento'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/hse/documents/${row.original.document.id}`}
          className="rounded-sm text-brand-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.original.document.title}
        </Link>
      ),
      filterFn: matchesId((r) => r.document.id),
    });
  }
  columns.push(
    {
      id: 'version',
      accessorKey: 'version',
      ...titled('Versión'),
      cell: ({ row }) => <span className="tabular-nums">v{row.original.version}</span>,
    },
    {
      id: 'status',
      accessorKey: 'status',
      ...titled('Estado'),
      cell: ({ row }) => <HseStatusBadge ui={HSE_ACK_STATUS_UI[row.original.status]} />,
      filterFn: matchesId((r) => r.status),
    },
    {
      id: 'responded_at',
      accessorKey: 'responded_at',
      ...titled('Respondió'),
      cell: ({ row }) =>
        row.original.responded_at ? (
          <span className="tabular-nums">{formatArgentinaDateTime(row.original.responded_at)}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: 'reject_reason',
      accessorKey: 'reject_reason',
      ...titled('Motivo del rechazo'),
      cell: ({ row }) => <span className="line-clamp-2 max-w-xs">{row.original.reject_reason ?? '-'}</span>,
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      ...titled('Asignado'),
      cell: ({ row }) => <span className="tabular-nums">{formatArgentinaDateTime(row.original.created_at)}</span>,
    }
  );
  return columns;
}
