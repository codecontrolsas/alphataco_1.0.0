'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { ActiveStatusBadge } from '../../components/ActiveStatusBadge';
import type { WorkDiagramListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

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
  onEdit: (item: WorkDiagramListItem) => void
): ColumnDef<WorkDiagramListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'listado', 'update');

  return [
    // ── Nombre ────────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => (
        <span className={`font-medium ${!row.original.is_active ? 'opacity-50' : ''}`}>{row.original.name}</span>
      ),
      // filterFn no necesario — usa filtro tipo text
    },

    // ── Días activos ──────────────────────────────────────────────────────────
    {
      accessorKey: 'active_working_days',
      meta: { title: 'Días activos' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Días activos" />,
      cell: ({ row }) => {
        const val = row.original.active_working_days;
        return (
          <span className={!row.original.is_active ? 'opacity-50' : ''}>
            {val !== null && val !== undefined ? String(val) : '—'}
          </span>
        );
      },
    },

    // ── Días inactivos ────────────────────────────────────────────────────────
    {
      accessorKey: 'inactive_working_days',
      meta: { title: 'Días inactivos' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Días inactivos" />,
      cell: ({ row }) => {
        const val = row.original.inactive_working_days;
        return (
          <span className={!row.original.is_active ? 'opacity-50' : ''}>
            {val !== null && val !== undefined ? String(val) : '—'}
          </span>
        );
      },
    },

    // ── Estado (is_active — booleano nullable) ────────────────────────────────
    {
      accessorKey: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <ActiveStatusBadge value={row.original.is_active} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        if (val === null || val === undefined) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Novedades activas (M:M — work_diagram_active_novelties) ──────────────
    {
      id: 'active_novelties',
      accessorFn: (row) => {
        const novelties = row.work_diagram_active_novelties ?? [];
        return novelties
          .map((n) => n.diagram_type?.name ?? '')
          .filter(Boolean)
          .join(', ');
      },
      meta: { title: 'Novedades activas' },
      enableSorting: false,
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue || !Array.isArray(filterValue) || filterValue.length === 0) return true;
        const novelties = row.original.work_diagram_active_novelties ?? [];
        if (novelties.length === 0) return filterValue.includes(NULL_FILTER_VALUE);
        return novelties.some((n) => n.diagram_type?.id && filterValue.includes(n.diagram_type.id));
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Novedades activas" />,
      cell: ({ row }) => {
        const novelties = row.original.work_diagram_active_novelties ?? [];
        if (novelties.length === 0) {
          return <span className="text-muted-foreground text-sm">—</span>;
        }
        const names = novelties.map((n) => n.diagram_type?.name).filter(Boolean) as string[];
        const first = names[0];
        const remaining = names.length - 1;

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex cursor-pointer">
                  <Badge className="whitespace-nowrap">
                    {first}
                    {remaining > 0 && ` +${remaining}`}
                  </Badge>
                </div>
              </TooltipTrigger>
              {remaining > 0 && (
                <TooltipContent className="text-white bg-black rounded-lg p-2">
                  <div className="flex flex-col gap-1">
                    {names.map((name, idx) => (
                      <span key={idx} className="text-sm">
                        {name}
                      </span>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },

    // ── Novedad inactiva (FK → diagram_type) ─────────────────────────────────
    // enableSorting: false porque es FK con accessorFn y no hay FK_SORT_MAP configurado
    {
      id: 'inactive_novelty',
      accessorFn: (row) => row.diagram_type?.name ?? '',
      meta: { title: 'Novedad inactiva' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Novedad inactiva" />,
      cell: ({ row }) => {
        const name = row.original.diagram_type?.name;
        return (
          <span className={!row.original.is_active ? 'opacity-50' : ''}>
            {name ?? <span className="text-muted-foreground">—</span>}
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.inactive_novelty;
        if (id === null || id === undefined) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) => {
        const val = row.original.created_at;
        return <span>{val ? formatArgentinaDay(val) : '—'}</span>;
      },
    },

    // ── Acciones ──────────────────────────────────────────────────────────────
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
                aria-label={`Editar ${row.original.name}`}
                onClick={() => onEdit(row.original)}
              >
                Editar
              </Button>
            ),
          },
        ] as ColumnDef<WorkDiagramListItem>[])
      : []),
  ];
}
