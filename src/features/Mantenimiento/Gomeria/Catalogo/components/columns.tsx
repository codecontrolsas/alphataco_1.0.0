'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  tireRetreadLabels,
  tireStatusBadges,
  tireStatusLabels,
  tireTreadTypeLabels,
} from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { CircleOff, MapPin, Pencil, Trash2, Warehouse, Wrench } from 'lucide-react';
import moment from 'moment';
import type { TireListItem } from '../actions/actions.server';

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// WAREHOUSE LABEL (cell + export share it)
// ============================================================================

/**
 * Donde esta la cubierta segun su unidad de stock: el deposito si esta IN_STOCK; "Afuera" si esta
 * OUT (montada, en reparacion o extraviada con stock); "Dada de baja" si fue descartada; "Sin stock"
 * si no tiene unidad (anterior a la etapa 6 o sin inventario inicial).
 */
export function getTireWarehouseLabel(unit: TireListItem['material_unit']): string {
  if (!unit) return 'Sin stock';
  if (unit.status === 'IN_STOCK') return unit.warehouse?.name ?? 'Sin stock';
  if (unit.status === 'DISCARDED') return 'Dada de baja';
  return 'Afuera';
}

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: Permissions,
  onEdit: (tire: TireListItem) => void,
  onDelete: (tire: TireListItem) => void,
  onMarkFound?: (tire: TireListItem) => void,
  onMarkRepaired?: (tire: TireListItem) => void,
  canViewPrices = false
): ColumnDef<TireListItem>[] {
  const canUpdate = permissions.hasPermission('mantenimiento', 'catalogo_cubiertas', 'update');
  const canDelete = permissions.hasPermission('mantenimiento', 'catalogo_cubiertas', 'delete');

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

    // --- Serial Number ---
    {
      id: 'serial_number',
      accessorKey: 'serial_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => <div className="font-mono text-sm font-medium">{row.original.serial_number}</div>,
      meta: { title: 'Número' },
    },

    // --- Brand ---
    {
      id: 'brand_id',
      accessorFn: (row) => row.brand?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marca" />,
      cell: ({ row }) => <div>{row.original.brand?.name ?? <span className="text-muted-foreground">-</span>}</div>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.brand_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
      meta: { title: 'Marca' },
    },

    // --- Size ---
    {
      id: 'size',
      accessorFn: (row) => row.tire_type?.size ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Medida" />,
      cell: ({ row }) => <div className="font-mono text-sm">{row.original.tire_type?.size ?? '-'}</div>,
      meta: { title: 'Medida' },
    },

    // --- Is New ---
    {
      id: 'is_new',
      accessorKey: 'is_new',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Condición" />,
      cell: ({ row }) => (
        <Badge variant={row.original.is_new ? 'success' : 'outline'}>{row.original.is_new ? 'Nueva' : 'Usada'}</Badge>
      ),
      filterFn: (row, id, value: string[]) => {
        return value.includes(String(row.getValue(id)));
      },
      meta: { title: 'Condición' },
    },

    // --- Retread Level (nullable) ---
    {
      id: 'retread_level',
      accessorKey: 'retread_level',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Precurado" />,
      cell: ({ row }) => {
        const val = row.original.retread_level;
        if (!val) return <div className="text-muted-foreground">-</div>;
        return <Badge variant="outline">{tireRetreadLabels[val] ?? val}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Precurado' },
    },

    // --- Tread Type ---
    {
      id: 'tread_type',
      accessorFn: (row) => row.tire_type?.tread_type ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de banda" />,
      cell: ({ row }) => {
        const val = row.original.tire_type?.tread_type;
        return <div>{val ? tireTreadTypeLabels[val] ?? val : '-'}</div>;
      },
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.tire_type?.tread_type;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Tipo de banda' },
    },

    // --- Tread Depth ---
    {
      id: 'tread_depth',
      accessorKey: 'tread_depth',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Profundidad" />,
      cell: ({ row }) => {
        const val = row.original.tread_depth;
        if (val == null) return <div className="text-muted-foreground">-</div>;
        return <div>{String(val)} mm</div>;
      },
      meta: { title: 'Profundidad (mm)' },
    },

    // --- Status ---
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const status = row.original.status;
        return <Badge variant={tireStatusBadges[status] ?? 'default'}>{tireStatusLabels[status] ?? status}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Estado' },
    },

    // --- Vehicle (current installation) ---
    {
      id: 'vehicle',
      accessorFn: (row) => row.vehicle_tire_positions?.[0]?.vehicle?.domain ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vehículo" />,
      cell: ({ row }) => {
        const domain = row.original.vehicle_tire_positions?.[0]?.vehicle?.domain;
        if (!domain)
          return (
            <div className="inline-flex items-center gap-1 text-muted-foreground">
              <CircleOff className="h-3 w-3" />
              Sin asignar
            </div>
          );
        return <Badge variant="outline">{domain}</Badge>;
      },
      filterFn: (row, _id, value: string[]) => {
        const vehicleId = row.original.vehicle_tire_positions?.[0]?.vehicle?.id ?? null;
        if (vehicleId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(vehicleId);
      },
      enableSorting: false,
      meta: { title: 'Vehículo' },
    },

    // --- Warehouse (stock unit location) ---
    {
      id: 'warehouse',
      accessorFn: (row) => getTireWarehouseLabel(row.material_unit),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Depósito" />,
      cell: ({ row }) => {
        const unit = row.original.material_unit;
        const label = getTireWarehouseLabel(unit);
        if (unit?.status === 'IN_STOCK' && unit.warehouse) {
          return (
            <div className="inline-flex items-center gap-1">
              <Warehouse className="h-3 w-3 text-muted-foreground" />
              {label}
            </div>
          );
        }
        return (
          <div className="inline-flex items-center gap-1 text-muted-foreground">
            <CircleOff className="h-3 w-3" />
            {label}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const unit = row.original.material_unit;
        const warehouseId = unit?.status === 'IN_STOCK' ? (unit.warehouse?.id ?? null) : null;
        if (warehouseId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(warehouseId);
      },
      meta: { title: 'Depósito' },
    },

    // --- Cost (latest entry cost of the unit; only with view_prices) ---
    ...(canViewPrices
      ? [
          {
            id: 'cost',
            accessorFn: (row: TireListItem) => row.unit_cost,
            header: ({ column }) => <DataTableColumnHeader column={column} title="Costo" />,
            cell: ({ row }) =>
              row.original.unit_cost != null ? (
                <span className="tabular-nums">{formatMoney(row.original.unit_cost)}</span>
              ) : (
                <span className="text-muted-foreground">Sin costo</span>
              ),
            enableSorting: false,
            meta: { title: 'Costo' },
          } satisfies ColumnDef<TireListItem>,
        ]
      : []),

    // --- Created At ---
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de alta" />,
      cell: ({ row }) => (
        <div>{row.original.created_at ? moment(row.original.created_at).format('DD/MM/YYYY') : '-'}</div>
      ),
      meta: { title: 'Fecha de alta' },
    },

    // --- Actions ---
    ...(canUpdate || canDelete
      ? [
          {
            id: 'actions',
            cell: ({ row }: { row: import('@tanstack/react-table').Row<TireListItem> }) => (
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1">
                  {canUpdate && row.original.status === 'MISSING' && onMarkFound && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600 hover:text-green-700"
                          onClick={() => onMarkFound(row.original)}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Marcar como encontrada</TooltipContent>
                    </Tooltip>
                  )}
                  {canUpdate && row.original.status === 'IN_REPAIR' && onMarkRepaired && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-600 hover:text-blue-700"
                          onClick={() => onMarkRepaired(row.original)}
                        >
                          <Wrench className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Marcar como reparada</TooltipContent>
                    </Tooltip>
                  )}
                  {canUpdate && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(row.original)}>
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
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onDelete(row.original)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Eliminar</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TooltipProvider>
            ),
            enableSorting: false,
            enableHiding: false,
            meta: { title: '', excludeFromExport: true },
          } satisfies ColumnDef<TireListItem>,
        ]
      : []),
  ];
}
