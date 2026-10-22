'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Power, X } from 'lucide-react';
import moment from 'moment';
import type { ClothingSizeListItem } from './actions.server';

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

type ColumnCallbacks = {
  onEdit: (size: ClothingSizeListItem) => void;
  onToggleActive: (size: ClothingSizeListItem) => void;
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['created_at'];

// ============================================================================
// COLUMNS FACTORY
// ============================================================================

export function getColumns(permissions: Permissions, callbacks: ColumnCallbacks): ColumnDef<ClothingSizeListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'talles_indumentaria', 'update');
  const canDelete = permissions.hasPermission('configuracion', 'talles_indumentaria', 'delete');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      id: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },

    // ── Estado (boolean) ─────────────────────────────────────────────────────
    {
      accessorKey: 'is_active',
      id: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="success" className="gap-1">
            <Check className="h-3 w-3" />
            Activo
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <X className="h-3 w-3" />
            Inactivo
          </Badge>
        ),
      filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id))),
    },

    // ── Fecha de creación (oculta por defecto) ───────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) =>
        row.original.created_at ? <span>{moment(row.original.created_at).format('DD/MM/YYYY')}</span> : <span>-</span>,
    },

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...(canUpdate || canDelete
      ? [
          {
            id: 'actions',
            meta: { excludeFromExport: true, title: '' },
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }: { row: { original: ClothingSizeListItem } }) => (
              <TooltipProvider delayDuration={100}>
                <div className="flex items-center gap-1">
                  {canUpdate && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => callbacks.onEdit(row.original)}
                        >
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
                          onClick={() => callbacks.onToggleActive(row.original)}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{row.original.is_active ? 'Desactivar' : 'Activar'}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TooltipProvider>
            ),
          } satisfies ColumnDef<ClothingSizeListItem>,
        ]
      : []),
  ];
}
