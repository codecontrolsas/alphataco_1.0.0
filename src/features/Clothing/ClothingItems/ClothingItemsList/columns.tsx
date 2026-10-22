'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Power, X } from 'lucide-react';
import moment from 'moment';
import type { ClothingItemListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['created_at', 'description'];

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

type ActionsHandlers = {
  onEdit: (item: ClothingItemListItem) => void;
  onToggleActive: (item: ClothingItemListItem) => void;
};

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(permissions: Permissions, handlers: ActionsHandlers): ColumnDef<ClothingItemListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'articulos_indumentaria', 'update');
  const canDelete = permissions.hasPermission('configuracion', 'articulos_indumentaria', 'delete');

  const cols: ColumnDef<ClothingItemListItem>[] = [
    // ── Name ──────────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      id: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => (
        <span className={row.original.is_active ? '' : 'text-muted-foreground line-through'}>{row.original.name}</span>
      ),
    },

    // ── Code ──────────────────────────────────────────────────────────────────
    {
      accessorKey: 'code',
      id: 'code',
      meta: { title: 'Código' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
      cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.code ?? '-'}</span>,
    },

    // ── Description (hidden by default) ───────────────────────────────────────
    {
      accessorKey: 'description',
      id: 'description',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => (
        <span className="max-w-[300px] truncate text-sm text-muted-foreground">{row.original.description ?? '-'}</span>
      ),
    },

    // ── is_active ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'is_active',
      id: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="success" className="flex w-fit items-center gap-1">
            <Check className="h-3 w-3" />
            Activo
          </Badge>
        ) : (
          <Badge variant="secondary" className="flex w-fit items-center gap-1 opacity-60">
            <X className="h-3 w-3" />
            Inactivo
          </Badge>
        ),
      filterFn: (row, id, value: string[]) => {
        return value.includes(String(row.getValue(id)));
      },
    },

    // ── created_at (hidden by default) ────────────────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) => (row.original.created_at ? moment(row.original.created_at).format('DD/MM/YYYY') : '-'),
    },

    // ── actions ───────────────────────────────────────────────────────────────
    ...(canUpdate || canDelete
      ? [
          {
            id: 'actions',
            meta: { excludeFromExport: true, title: '' },
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }: { row: { original: ClothingItemListItem } }) => {
              const item = row.original;
              return (
                <TooltipProvider delayDuration={100}>
                  <div className="flex items-center gap-1">
                    {canUpdate && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlers.onEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                    )}
                    {canDelete && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handlers.onToggleActive(item)}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{item.is_active ? 'Desactivar' : 'Activar'}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>
              );
            },
          } satisfies ColumnDef<ClothingItemListItem>,
        ]
      : []),
  ];

  return cols;
}
