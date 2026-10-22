'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { RowActionsMenu, type RowAction } from '@/features/Mantenimiento/Gomeria/shared/RowActionsMenu';
import { TireStatusPill } from '@/features/Mantenimiento/Gomeria/shared/TireStatusPills';
import {
  tirePositionSideLabels,
  tireRetreadLabels,
  tireTreadTypeLabels,
} from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { matchesNullableId } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleOff, MapPin, Pencil, Trash2, Warehouse, Wrench } from 'lucide-react';
import type { TireListItem } from '../actions/tire-list.server';

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

/**
 * Columnas que arrancan ocultas en el diseño nuevo (`-v2`): quedan disponibles en el selector de columnas y en
 * el export. Las preferencias guardadas del usuario ganan sobre esta lista.
 */
export const TIRE_HIDDEN_COLUMNS_BY_DEFAULT: Record<string, boolean> = {
  retread_level: false,
  tread_type: false,
  cost: false,
  created_at: false,
};

/** "E1 Izq.": eje y lado donde está montada la cubierta. */
function formatTirePosition(position: TireListItem['vehicle_tire_positions'][number] | undefined): string | null {
  if (!position) return null;
  const side = tirePositionSideLabels[position.side] ?? position.side;
  return `E${position.axle_number} ${side}`;
}

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

    // --- Status ---
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <TireStatusPill status={row.original.status} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Estado' },
    },

    // --- Brand ---
    {
      id: 'brand_id',
      accessorFn: (row) => row.brand?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marca" />,
      cell: ({ row }) => <div>{row.original.brand?.name ?? <span className="text-muted-foreground">-</span>}</div>,
      filterFn: matchesNullableId((row) => row.brand_id),
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

    // --- Condition (compuesta: nueva / usada + nivel de precurado; el precurado sigue como columna oculta) ---
    {
      id: 'is_new',
      accessorKey: 'is_new',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Condición" />,
      cell: ({ row }) => {
        const retread = row.original.retread_level;
        if (retread) return <div>{tireRetreadLabels[retread] ?? retread}</div>;
        return <div>{row.original.is_new ? 'Nueva' : 'Usada'}</div>;
      },
      filterFn: (row, id, value: string[]) => {
        return value.includes(String(row.getValue(id)));
      },
      meta: { title: 'Condición' },
    },

    // --- Retread Level (nullable; atómica, oculta por defecto) ---
    {
      id: 'retread_level',
      accessorKey: 'retread_level',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Precurado" />,
      cell: ({ row }) => {
        const val = row.original.retread_level;
        if (!val) return <div className="text-muted-foreground">-</div>;
        return <div>{tireRetreadLabels[val] ?? val}</div>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
      meta: { title: 'Precurado' },
    },

    // --- Vehicle (compuesta: dominio + posición actual) ---
    {
      id: 'vehicle',
      accessorFn: (row) => row.vehicle_tire_positions?.[0]?.vehicle?.domain ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vehículo" />,
      cell: ({ row }) => {
        const position = row.original.vehicle_tire_positions?.[0];
        const domain = position?.vehicle?.domain;
        if (!domain)
          return (
            <div className="text-muted-foreground inline-flex items-center gap-1">
              <CircleOff className="h-3 w-3" aria-hidden="true" />
              Sin asignar
            </div>
          );
        const place = formatTirePosition(position);
        return (
          <div className="font-mono text-sm">
            {domain}
            {place ? <span className="text-muted-foreground"> · {place}</span> : null}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const vehicleId = row.original.vehicle_tire_positions?.[0]?.vehicle?.id ?? null;
        if (vehicleId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(vehicleId);
      },
      enableSorting: false,
      meta: { title: 'Vehículo' },
    },

    // --- Tread Depth ---
    {
      id: 'tread_depth',
      accessorKey: 'tread_depth',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Profundidad (mm)" />,
      cell: ({ row }) => {
        const val = row.original.tread_depth;
        if (val == null) return <div className="text-muted-foreground">-</div>;
        return <div className="font-mono text-sm tabular-nums">{String(val)} mm</div>;
      },
      meta: { title: 'Profundidad (mm)' },
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
              <Warehouse className="text-muted-foreground h-3 w-3" aria-hidden="true" />
              {label}
            </div>
          );
        }
        return (
          <div className="text-muted-foreground inline-flex items-center gap-1">
            <CircleOff className="h-3 w-3" aria-hidden="true" />
            {label}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const unit = row.original.material_unit;
        const warehouseId = unit?.status === 'IN_STOCK' ? unit.warehouse?.id ?? null : null;
        if (warehouseId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(warehouseId);
      },
      meta: { title: 'Depósito' },
    },

    // --- Tread Type (atómica, oculta por defecto) ---
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
      cell: ({ row }) => <div>{row.original.created_at ? formatArgentinaDay(row.original.created_at) : '-'}</div>,
      meta: { title: 'Fecha de alta' },
    },

    // --- Actions: menú ⋯; cada acción con la misma clave que exige el servidor (update / delete) ---
    ...(canUpdate || canDelete
      ? [
          {
            id: 'actions',
            cell: ({ row }: { row: import('@tanstack/react-table').Row<TireListItem> }) => {
              const tire = row.original;
              const actions: RowAction[] = [];
              if (canUpdate && tire.status === 'MISSING' && onMarkFound) {
                actions.push({
                  key: 'found',
                  label: 'Marcar como encontrada',
                  icon: MapPin,
                  onSelect: () => onMarkFound(tire),
                });
              }
              if (canUpdate && tire.status === 'IN_REPAIR' && onMarkRepaired) {
                actions.push({
                  key: 'repaired',
                  label: 'Marcar como reparada',
                  icon: Wrench,
                  onSelect: () => onMarkRepaired(tire),
                });
              }
              if (canUpdate) actions.push({ key: 'edit', label: 'Editar', icon: Pencil, onSelect: () => onEdit(tire) });
              if (canDelete) {
                actions.push({
                  key: 'delete',
                  label: 'Eliminar',
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => onDelete(tire),
                });
              }
              return <RowActionsMenu label={`Acciones de la cubierta ${tire.serial_number}`} actions={actions} />;
            },
            enableSorting: false,
            enableHiding: false,
            meta: { title: '', excludeFromExport: true },
          } satisfies ColumnDef<TireListItem>,
        ]
      : []),
  ];
}
