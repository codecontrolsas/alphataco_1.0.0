'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RowActionsMenu, type RowAction } from '@/features/Mantenimiento/Gomeria/shared/RowActionsMenu';
import type { DiagramAxle } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { calculatePositions } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { CarFront, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TemplateListItem } from '../actions/actions.server';
import { TemplateAxlesMini } from './TemplateAxlesMini';

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// HELPERS
// ============================================================================

export function computePositionCount(item: TemplateListItem): number {
  if (!item.axles || item.axles.length === 0) return 0;

  const diagramAxles: DiagramAxle[] = item.axles.map((axle) => ({
    id: axle.id,
    axle_number: axle.axle_number,
    tires_per_side: axle.tires_per_side,
    tire_size: axle.tire_size,
    is_drive_axle: axle.is_drive_axle,
    is_spare: axle.is_spare,
  }));

  return calculatePositions(diagramAxles).length;
}

// ============================================================================
// COLUMNS
// ============================================================================

/** Columnas que arrancan ocultas en el diseño nuevo (`-v2`); las preferencias guardadas ganan sobre esta lista. */
export const TEMPLATE_HIDDEN_COLUMNS_BY_DEFAULT: Record<string, boolean> = {
  description: false,
  created_at: false,
};

/** Estado de las medidas de los ejes (celda y export comparten las etiquetas). */
export const templateSizesStatusLabels: Record<string, string> = {
  empty: 'Sin ejes',
  none: 'Por vehículo',
  partial: 'Parciales',
  all: 'Todas',
};

export function getColumns(
  permissions: Permissions,
  onEdit: (template: TemplateListItem) => void,
  onDelete: (template: TemplateListItem) => void,
  onAssign: (template: TemplateListItem) => void
): ColumnDef<TemplateListItem>[] {
  const canUpdate = permissions.hasPermission('mantenimiento', 'plantillas_cubiertas', 'update');
  const canCreate = permissions.hasPermission('mantenimiento', 'plantillas_cubiertas', 'create');
  const canDelete = permissions.hasPermission('mantenimiento', 'plantillas_cubiertas', 'delete');

  return [
    // --- Select ---
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todo"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { excludeFromExport: true, title: '' },
    },

    // --- Name (compuesta: mini diagrama de ejes + nombre + descripción; el export usa solo el nombre) ---
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Plantilla" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <TemplateAxlesMini axles={row.original.axles ?? []} />
          <div className="min-w-0">
            <div className="font-medium">{row.original.name}</div>
            {row.original.description ? (
              <div className="text-muted-foreground line-clamp-1 text-xs">{row.original.description}</div>
            ) : null}
          </div>
        </div>
      ),
      meta: { title: 'Nombre' },
    },

    // --- Description (atómica, oculta por defecto) ---
    {
      id: 'description',
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => (
        <div className="text-muted-foreground text-sm">
          {row.original.description ?? <span className="italic">Sin descripción</span>}
        </div>
      ),
      meta: { title: 'Descripción' },
    },

    // --- Axle Count (virtual) ---
    {
      id: 'axle_count',
      accessorFn: (row) => row._count?.axles ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ejes" />,
      cell: ({ row }) => <Badge variant="outline">{row.original._count?.axles ?? 0} ejes</Badge>,
      enableSorting: false,
      meta: { title: 'Ejes' },
    },

    // --- Position Count (virtual, computed from axles) ---
    {
      id: 'position_count',
      accessorFn: (row) => computePositionCount(row),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Posiciones" />,
      cell: ({ row }) => {
        const count = computePositionCount(row.original);
        return <Badge variant="secondary">{count} posiciones</Badge>;
      },
      enableSorting: false,
      meta: { title: 'Posiciones' },
    },

    // --- Sizes Status (virtual) ---
    {
      id: 'sizes_status',
      accessorFn: (row) => {
        const axles = row.axles ?? [];
        if (axles.length === 0) return 'empty';
        const withSize = axles.filter((a) => a.tire_size && a.tire_size.trim() !== '').length;
        if (withSize === 0) return 'none';
        if (withSize === axles.length) return 'all';
        return 'partial';
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Medidas" />,
      cell: ({ row }) => {
        const axles = row.original.axles ?? [];
        if (axles.length === 0) {
          return <Badge variant="outline">—</Badge>;
        }
        const withSize = axles.filter((a) => a.tire_size && a.tire_size.trim() !== '').length;

        let badge: ReactNode;
        let tooltipText: string;

        if (withSize === axles.length) {
          badge = <Badge variant="success">Todas</Badge>;
          tooltipText = `Los ${axles.length} ejes tienen medida cargada en la plantilla. Cada vehículo puede sobrescribirla individualmente desde su tab Cubiertas.`;
        } else if (withSize === 0) {
          badge = <Badge variant="outline">Por vehículo</Badge>;
          tooltipText = `Ningún eje tiene medida en la plantilla. Cada vehículo que la use debe configurar las medidas en su tab Cubiertas antes de poder iniciar órdenes de gomería.`;
        } else {
          badge = <Badge variant="yellow">Parciales</Badge>;
          tooltipText = `${withSize} de ${axles.length} ejes con medida cargada en la plantilla. Los ${axles.length - withSize} restantes deben configurarse por vehículo desde su tab Cubiertas.`;
        }

        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="focus-visible:ring-ring/50 inline-block cursor-help rounded-sm outline-none focus-visible:ring-[3px]"
                >
                  {badge}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs leading-relaxed">{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      enableSorting: false,
      meta: { title: 'Medidas' },
    },

    // --- Created At ---
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => <div>{row.original.created_at ? formatArgentinaDay(row.original.created_at) : '-'}</div>,
      meta: { title: 'Creado' },
    },

    // --- Actions: menú ⋯ (asignar = create, editar = update, eliminar = delete) ---
    ...(canUpdate || canCreate || canDelete
      ? [
          {
            id: 'actions',
            cell: ({ row }: { row: import('@tanstack/react-table').Row<TemplateListItem> }) => {
              const template = row.original;
              const actions: RowAction[] = [];
              if (canCreate)
                actions.push({
                  key: 'assign',
                  label: 'Asignar a subtipo',
                  icon: CarFront,
                  onSelect: () => onAssign(template),
                });
              if (canUpdate)
                actions.push({ key: 'edit', label: 'Editar', icon: Pencil, onSelect: () => onEdit(template) });
              if (canDelete) {
                actions.push({
                  key: 'delete',
                  label: 'Eliminar',
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => onDelete(template),
                });
              }
              return <RowActionsMenu label={`Acciones de la plantilla ${template.name}`} actions={actions} />;
            },
            enableSorting: false,
            enableHiding: false,
            meta: { title: '', excludeFromExport: true },
          } satisfies ColumnDef<TemplateListItem>,
        ]
      : []),
  ];
}
