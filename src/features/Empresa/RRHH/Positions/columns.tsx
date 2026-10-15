'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { ActiveStatusBadge } from '../../components/ActiveStatusBadge';
import type { PositionListItem } from './actions.server';

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
  onEdit: (item: PositionListItem) => void
): ColumnDef<PositionListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'positions', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name ?? '-'}</span>,
    },

    // ── Estado (is_active — booleano nullable) ───────────────────────────────
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

    // ── Sector/Departamento (hierarchical_position_id — array de UUIDs) ─────
    {
      id: 'hierarchy',
      accessorFn: (row) => row.hierarchyNames?.join(', ') ?? '',
      meta: { title: 'Sector/Departamento' },
      enableSorting: false, // campo virtual (array en BD, no un campo ordenable directamente)
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector/Departamento" />,
      cell: ({ row }) => {
        const names = row.original.hierarchyNames ?? [];
        if (names.length === 0) return <span className="text-muted-foreground text-sm">-</span>;

        const [first, ...rest] = names;
        if (rest.length === 0) {
          return <Badge variant="outline">{first}</Badge>;
        }

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-pointer select-none">
                  {first} +{rest.length}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="text-white bg-black rounded-lg p-2">
                <div className="flex flex-col gap-1">
                  {rest.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const ids = row.original.hierarchical_position_id ?? [];
        if (ids.length === 0) return value.includes(NULL_FILTER_VALUE);
        return ids.some((id) => value.includes(id));
      },
    },

    // ── Aptitudes Técnicas (M:M) ─────────────────────────────────────────────
    {
      id: 'aptitudes',
      accessorFn: (row) => row.aptitudes_tecnicas_puestos?.map((rel) => rel.aptitudes_tecnicas.nombre).join(', ') ?? '',
      meta: { title: 'Aptitudes Técnicas' },
      enableSorting: false, // campo M:M, no ordenable directamente
      header: ({ column }) => <DataTableColumnHeader column={column} title="Aptitudes Técnicas" />,
      cell: ({ row }) => {
        const aptitudes = row.original.aptitudes_tecnicas_puestos ?? [];
        if (aptitudes.length === 0) return <span className="text-muted-foreground text-sm">Sin aptitudes</span>;

        const names = aptitudes.map((rel) => rel.aptitudes_tecnicas.nombre);
        const [first, ...rest] = names;

        if (rest.length === 0) {
          return <Badge variant="outline">{first}</Badge>;
        }

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-pointer select-none">
                  {first} +{rest.length}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="text-white bg-black rounded-lg p-2">
                <div className="flex flex-col gap-1">
                  {rest.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const aptitudes = row.original.aptitudes_tecnicas_puestos ?? [];
        if (aptitudes.length === 0) return value.includes(NULL_FILTER_VALUE);
        return aptitudes.some((rel) => value.includes(rel.aptitudes_tecnicas.id));
      },
    },

    // ── Fecha de creación (oculta por defecto) ───────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) => {
        const val = row.original.created_at;
        return <span>{val ? formatArgentinaDay(val) : '-'}</span>;
      },
    },

    // ── Acciones ─────────────────────────────────────────────────────────────
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
        ] as ColumnDef<PositionListItem>[])
      : []),
  ];
}
