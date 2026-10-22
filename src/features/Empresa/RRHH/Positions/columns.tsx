'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  activeStatusColumn,
  createdAtColumn,
  editActionColumn,
  nameColumn,
} from '@/features/Empresa/components/catalog-columns';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
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
    nameColumn<PositionListItem>('-'),

    // ── Estado (is_active — booleano nullable) ───────────────────────────────
    activeStatusColumn<PositionListItem>(),

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
    createdAtColumn<PositionListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...editActionColumn<PositionListItem>({ canEdit: canUpdate, onEdit, getName: (item) => String(item.name) }),
  ];
}
