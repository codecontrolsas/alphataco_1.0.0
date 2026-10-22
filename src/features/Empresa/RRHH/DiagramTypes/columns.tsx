'use client';

import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { ActiveStatusBadge, BooleanBadge } from '../../components/ActiveStatusBadge';
import type { DiagramTypeListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['computes_absenteeism', 'created_at'];

// ============================================================================
// PERMISSIONS TYPE
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: Permissions,
  onEdit: (item: DiagramTypeListItem) => void
): ColumnDef<DiagramTypeListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'diagrams', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name || '-'}</span>,
    },

    // ── Descripción corta ─────────────────────────────────────────────────
    {
      accessorKey: 'short_description',
      meta: { title: 'Descripción corta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción corta" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm font-mono">{row.original.short_description || '-'}</span>
      ),
    },

    // ── Color ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'color',
      meta: { title: 'Color' },
      enableSorting: false,
      header: 'Color',
      cell: ({ row }) => (
        <div
          className="w-10 h-10 rounded-full border-2 border-border/50 flex items-center justify-center text-sm font-bold shadow-sm"
          style={{ backgroundColor: row.original.color || '#94a3b8' }}
          title={row.original.short_description ?? row.original.name ?? undefined}
        >
          <span className="text-white drop-shadow-md">{row.original.short_description || '—'}</span>
        </div>
      ),
    },

    // ── Laboralmente activo (work_active — booleano nullable) ─────────────
    {
      accessorKey: 'work_active',
      meta: { title: 'Lab. Activa' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lab. Activa" />,
      cell: ({ row }) => {
        const val = row.original.work_active;
        if (val === null || val === undefined) return <ActiveStatusBadge value={null} />;
        return <BooleanBadge value={val} trueLabel="Trabajando" falseLabel="No trabajando" />;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        if (val === null || val === undefined) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Computa ausentismo ─────────────────────────────────────────────────
    {
      accessorKey: 'computes_absenteeism',
      meta: { title: 'Computa ausentismo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Computa ausentismo" />,
      cell: ({ row }) => <BooleanBadge value={row.original.computes_absenteeism} trueLabel="Sí" falseLabel="No" />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },

    // ── Estado (is_active — booleano NOT NULL) ────────────────────────────
    {
      accessorKey: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <ActiveStatusBadge value={row.original.is_active} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        return value.includes(String(val));
      },
    },

    // ── Fecha de creación (oculta por defecto) ─────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) => {
        const val = row.original.created_at;
        return <span>{val ? formatArgentinaDay(val) : '-'}</span>;
      },
    },

    // ── Acciones ──────────────────────────────────────────────────────────
    ...(canUpdate
      ? ([
          {
            id: 'actions',
            meta: { title: '', excludeFromExport: true },
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
              <Button
                size="sm"
                variant="link"
                type="button"
                className="h-auto p-0"
                aria-label={`Editar ${row.original.name ?? 'tipo de novedad'}`}
                onClick={() => onEdit(row.original)}
              >
                Editar
              </Button>
            ),
          },
        ] as ColumnDef<DiagramTypeListItem>[])
      : []),
  ];
}
