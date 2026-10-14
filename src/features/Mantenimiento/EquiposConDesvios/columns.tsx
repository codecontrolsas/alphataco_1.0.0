'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Wrench } from 'lucide-react';
import Link from 'next/link';
import type { EquipmentWithDeviationsListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

// No hay columnas secundarias: con solo 8 columnas de datos todas se muestran por default.
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

/**
 * `onResolveDeviations` abre el modal de resolución de desvíos críticos para el
 * equipo de la fila — vive en el Client Component porque necesita estado local.
 */
export function getColumns(
  onResolveDeviations: (equipmentId: string) => void
): ColumnDef<EquipmentWithDeviationsListItem>[] {
  return [
    // ─── Dominio ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'domain',
      meta: { title: 'Dominio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dominio" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.domain ?? '-'}
        </Link>
      ),
    },

    // ─── Serie ───────────────────────────────────────────────────────────────
    {
      accessorKey: 'serie',
      meta: { title: 'Serie' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Serie" />,
      cell: ({ row }) => <span>{row.original.serie ?? '-'}</span>,
    },

    // ─── N° Interno ──────────────────────────────────────────────────────────
    {
      accessorKey: 'intern_number',
      meta: { title: 'N° Interno' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Interno" />,
      cell: ({ row }) => <span>{row.original.intern_number ?? '-'}</span>,
    },

    // ─── Categoría (Vehículo / Equipamiento — types_of_vehicles) ─────────────
    {
      id: 'type_of_vehicle',
      accessorFn: (row) => row.types_of_vehicles?.name ?? '',
      meta: { title: 'Categoría' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Categoría" />,
      cell: ({ row }) =>
        row.original.types_of_vehicles?.name ? (
          <Badge variant="outline">{row.original.types_of_vehicles.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: (row, _id, value: string[]) => value.includes(String(row.original.type_of_vehicle)),
    },

    // ─── Tipo de Unidad (FK UUID → type) ──────────────────────────────────────
    {
      id: 'type',
      accessorFn: (row) => row.type_vehicles_typeTotype?.name ?? '',
      meta: { title: 'Tipo de Unidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de Unidad" />,
      cell: ({ row }) =>
        row.original.type_vehicles_typeTotype?.name ? (
          <Badge>{row.original.type_vehicles_typeTotype.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.type_vehicles_typeTotype?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ─── Subtipo de Unidad (FK UUID nullable → sub_type) ─────────────────────
    {
      id: 'sub_type',
      accessorFn: (row) => row.sub_type?.name ?? '',
      meta: { title: 'Subtipo de Unidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subtipo de Unidad" />,
      cell: ({ row }) =>
        row.original.sub_type?.name ? (
          <Badge variant="secondary">{row.original.sub_type.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.sub_type?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ─── Sector (FK UUID nullable → hierarchy) ───────────────────────────────
    {
      id: 'sector',
      accessorFn: (row) => row.hierarchy?.name ?? '',
      meta: { title: 'Sector' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector" />,
      cell: ({ row }) =>
        row.original.hierarchy?.name ? (
          <Badge variant="secondary">{row.original.hierarchy.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.hierarchy?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ─── Cantidad de Desvíos (calculada) ─────────────────────────────────────
    {
      accessorKey: 'deviation_count',
      meta: { title: 'Cantidad de Desvíos' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cantidad de Desvíos" />,
      cell: ({ row }) => {
        const count = row.original.deviation_count;
        return (
          <span className="font-semibold text-destructive">
            {count} {count === 1 ? 'desvío' : 'desvíos'}
          </span>
        );
      },
    },

    // ─── Último Desvío (calculada) ────────────────────────────────────────────
    {
      accessorKey: 'last_deviation_date',
      meta: { title: 'Último Desvío' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Último Desvío" />,
      cell: ({ row }) => {
        const date = row.original.last_deviation_date;
        if (!date) return <span className="text-muted-foreground">-</span>;
        const [day, time] = formatArgentinaDateTime(date).split(' ');
        return (
          <div className="flex flex-col">
            <span>{day}</span>
            <span className="text-xs text-muted-foreground">{time}</span>
          </div>
        );
      },
    },

    // ─── Acciones ─────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true },
      cell: ({ row }) => (
        <Button
          type="button"
          onClick={() => onResolveDeviations(row.original.id)}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Wrench className="h-4 w-4" />
          Resolver Desvíos
        </Button>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
