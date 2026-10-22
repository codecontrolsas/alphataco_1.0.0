'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import type { DataTableFilterOption } from '@/shared/components/common/DataTable/types';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Power, X } from 'lucide-react';
import moment from 'moment';

/**
 * Columnas que repiten las tablas del catálogo de ropa (marcas, artículos, talles): nombre, estado
 * activo/inactivo, fecha de creación y las acciones editar / activar-desactivar.
 */

/** Opciones del filtro "Estado" con los mismos íconos que muestra la celda. */
export const ACTIVE_STATUS_OPTIONS: DataTableFilterOption[] = [
  { value: 'true', label: 'Activo', icon: Check },
  { value: 'false', label: 'Inactivo', icon: X },
];

/**
 * Columna "Nombre". Con `strikeInactive` el registro inactivo se ve tachado; sin él, el nombre va en
 * negrita (talles).
 */
export function catalogNameColumn<T extends { name: string; is_active: boolean }>(
  strikeInactive: boolean
): ColumnDef<T> {
  return {
    accessorKey: 'name',
    id: 'name',
    ...titled('Nombre'),
    cell: ({ row }) =>
      strikeInactive ? (
        <span className={row.original.is_active ? '' : 'text-muted-foreground line-through'}>{row.original.name}</span>
      ) : (
        <span className="font-medium">{row.original.name}</span>
      ),
  };
}

/** Columna "Estado" (`is_active`). `inactive` es la apariencia del badge de los inactivos. */
export function catalogActiveColumn<T extends { is_active: boolean }>(inactive: 'muted' | 'destructive'): ColumnDef<T> {
  return {
    accessorKey: 'is_active',
    id: 'is_active',
    ...titled('Estado'),
    cell: ({ row }) => {
      if (row.original.is_active) {
        return (
          <Badge variant="success" className={inactive === 'muted' ? 'flex w-fit items-center gap-1' : 'gap-1'}>
            <Check className="h-3 w-3" />
            Activo
          </Badge>
        );
      }
      return inactive === 'muted' ? (
        <Badge variant="secondary" className="flex w-fit items-center gap-1 opacity-60">
          <X className="h-3 w-3" />
          Inactivo
        </Badge>
      ) : (
        <Badge variant="destructive" className="gap-1">
          <X className="h-3 w-3" />
          Inactivo
        </Badge>
      );
    },
    filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id))),
  };
}

/** Columna "Fecha de creación" (oculta por defecto). */
export function catalogCreatedAtColumn<T extends { created_at: Date | string | null }>(): ColumnDef<T> {
  return {
    accessorKey: 'created_at',
    id: 'created_at',
    ...titled('Fecha de creación'),
    cell: ({ row }) => (row.original.created_at ? moment(row.original.created_at).format('DD/MM/YYYY') : '-'),
  };
}

/** Acciones de fila: editar (permiso `update`) y activar/desactivar (permiso `delete`). Sin ninguno, no hay columna. */
export function catalogActionsColumns<T extends { is_active: boolean }>({
  canUpdate,
  canDelete,
  onEdit,
  onToggleActive,
}: {
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (row: T) => void;
  onToggleActive: (row: T) => void;
}): ColumnDef<T>[] {
  if (!canUpdate && !canDelete) return [];
  return [
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <TooltipProvider delayDuration={100}>
          <div className="flex items-center gap-1">
            {canUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row.original)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleActive(row.original)}>
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{row.original.is_active ? 'Desactivar' : 'Activar'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      ),
    },
  ];
}
