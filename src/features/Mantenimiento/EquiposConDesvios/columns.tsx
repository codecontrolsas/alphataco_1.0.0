'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ATTENTION_THRESHOLDS } from '@/features/Mantenimiento/lib/attention-thresholds';
import { RelativeAge } from '@/features/Mantenimiento/shared/components/RelativeAge';
import { ResourceCell } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { matchesNullableId, titled } from '@/shared/components/common/DataTable/column-helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Wrench } from 'lucide-react';
import Link from 'next/link';
import type { EquipmentWithDeviationsListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

/**
 * Las columnas atómicas que la columna compuesta "Equipo" ya muestra (dominio, N° interno) y las secundarias
 * quedan ocultas, no borradas: siguen disponibles en el selector de columnas, en sus filtros y en el export.
 */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['domain', 'serie', 'intern_number', 'critical_count'];

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

/**
 * `onResolveDeviations` abre el modal de resolución de desvíos del equipo de la fila — vive en el Client
 * Component porque necesita estado local.
 */
export function getColumns(
  onResolveDeviations: (equipmentId: string) => void
): ColumnDef<EquipmentWithDeviationsListItem>[] {
  return [
    // ─── Equipo (compuesta: patente + N° interno · subtipo) ──────────────────
    // Solo presentación: el export lleva las columnas atómicas (Dominio, Serie, N° Interno…).
    {
      id: 'equipment',
      accessorFn: (row) => row.domain ?? '',
      meta: { title: 'Equipo', excludeFromExport: true },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
      cell: ({ row }) => {
        const equipment = row.original;
        if (!equipment.domain && !equipment.intern_number) return <span className="text-muted-foreground">-</span>;
        return (
          <Link
            href={`/dashboard/equipment/action?action=view&id=${equipment.id}`}
            aria-label={`Ver la ficha de ${equipment.domain ?? 'el equipo'}`}
            className="focus-visible:ring-ring/50 -m-1 block max-w-full rounded-md p-1 outline-none hover:underline focus-visible:ring-[3px]"
          >
            <ResourceCell
              resource={{
                kind: 'vehicle',
                identifier: equipment.domain ?? 'Sin dominio',
                internNumber: equipment.intern_number,
                subtitle: equipment.sub_type?.name ?? equipment.type_vehicles_typeTotype?.name ?? null,
              }}
            />
          </Link>
        );
      },
    },

    // ─── Cantidad de Desvíos (calculada) + críticos ──────────────────────────
    {
      accessorKey: 'deviation_count',
      ...titled('Cantidad de Desvíos'),
      cell: ({ row }) => {
        const { deviation_count: count, critical_count: critical } = row.original;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold tabular-nums">
              {count} {count === 1 ? 'desvío' : 'desvíos'}
            </span>
            {critical > 0 ? (
              <Badge variant="destructive">
                <AlertTriangle aria-hidden="true" />
                {critical} {critical === 1 ? 'crítico' : 'críticos'}
              </Badge>
            ) : null}
          </span>
        );
      },
    },

    // ─── Último Desvío (calculada) ────────────────────────────────────────────
    {
      accessorKey: 'last_deviation_date',
      ...titled('Último Desvío'),
      cell: ({ row }) => {
        const date = row.original.last_deviation_date;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return <RelativeAge value={date} />;
      },
    },

    // ─── Desvío más antiguo (calculada): marca en rojo pasados los 30 días sin pedido ──
    {
      accessorKey: 'first_deviation_date',
      ...titled('Desvío más antiguo'),
      cell: ({ row }) => {
        const date = row.original.first_deviation_date;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return <RelativeAge value={date} thresholdDays={ATTENTION_THRESHOLDS.deviationsWithoutRequestDays} />;
      },
    },

    // ─── Categoría (Vehículo / Equipamiento — types_of_vehicles) ─────────────
    {
      id: 'type_of_vehicle',
      accessorFn: (row) => row.types_of_vehicles?.name ?? '',
      ...titled('Categoría'),
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
      ...titled('Tipo de Unidad'),
      cell: ({ row }) =>
        row.original.type_vehicles_typeTotype?.name ? (
          <Badge>{row.original.type_vehicles_typeTotype.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: matchesNullableId((row) => row.type_vehicles_typeTotype?.id),
    },

    // ─── Subtipo de Unidad (FK UUID nullable → sub_type) ─────────────────────
    {
      id: 'sub_type',
      accessorFn: (row) => row.sub_type?.name ?? '',
      ...titled('Subtipo de Unidad'),
      cell: ({ row }) =>
        row.original.sub_type?.name ? (
          <Badge variant="secondary">{row.original.sub_type.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: matchesNullableId((row) => row.sub_type?.id),
    },

    // ─── Sector (FK UUID nullable → hierarchy) ───────────────────────────────
    {
      id: 'sector',
      accessorFn: (row) => row.hierarchy?.name ?? '',
      ...titled('Sector'),
      cell: ({ row }) =>
        row.original.hierarchy?.name ? (
          <Badge variant="secondary">{row.original.hierarchy.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      filterFn: matchesNullableId((row) => row.hierarchy?.id),
    },

    // ─── Atómicas ocultas por defecto (las muestra la columna compuesta "Equipo") ──
    {
      accessorKey: 'domain',
      ...titled('Dominio'),
      cell: ({ row }) => <span>{row.original.domain ?? '-'}</span>,
    },
    {
      accessorKey: 'serie',
      ...titled('Serie'),
      cell: ({ row }) => <span>{row.original.serie ?? '-'}</span>,
    },
    {
      accessorKey: 'intern_number',
      ...titled('N° Interno'),
      cell: ({ row }) => <span>{row.original.intern_number ?? '-'}</span>,
    },
    {
      accessorKey: 'critical_count',
      ...titled('Desvíos Críticos'),
      cell: ({ row }) => <span className="tabular-nums">{row.original.critical_count}</span>,
    },

    // ─── Acciones ─────────────────────────────────────────────────────────────
    // Resolver desvíos arma un pedido de mantenimiento: lo exige el servidor con `nuevo_pedido:create`
    // (`createOrUpdateMaintenanceRequest`), y la UI lo oculta con la misma clave. "Ver la ficha" es la patente.
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      header: '',
      cell: ({ row }) => (
        <PermissionGuard module="mantenimiento" tab="nuevo_pedido" action="create">
          <Button
            type="button"
            onClick={() => onResolveDeviations(row.original.id)}
            variant="outline"
            size="sm"
            aria-label={`Resolver los desvíos de ${row.original.domain ?? 'el equipo'}`}
          >
            <Wrench aria-hidden="true" />
            Resolver Desvíos
          </Button>
        </PermissionGuard>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
