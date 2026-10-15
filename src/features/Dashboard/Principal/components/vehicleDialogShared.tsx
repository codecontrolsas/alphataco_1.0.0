import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DataTableFacetedFilterConfig, FacetResult } from '@/shared/components/common/DataTable';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { conditionLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, CircleOff, Clock, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { AvailableVehicleItem } from '../actions/fleet.server';

/**
 * Piezas comunes de los diálogos de equipos (disponibles y fuera de servicio): comparten el mismo
 * `select`, las mismas columnas y los mismos filtros.
 */
export type VehicleDialogItem = AvailableVehicleItem;

/** Mismo icono en el filtro de condición y en el badge de la columna. */
export const conditionIcons: Record<string, LucideIcon> = {
  operativo: CheckCircle2,
  operativo_condicionado: AlertCircle,
  no_operativo: XCircle,
  en_reparacion: Wrench,
  en_preparacion: Clock,
};

export function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Opciones de condición del diálogo (sólo las que el diálogo puede mostrar). */
export function buildConditionFacetResult(allowed: readonly string[], counts: Map<string, number>): FacetResult {
  return {
    options: allowed.map((value) => ({
      value,
      label: conditionLabels[value] ?? value,
      icon: conditionIcons[value],
    })),
    counts,
  };
}

/** Un filtro por columna: tres de texto, condición, tipo, subtipo y afectaciones. */
export const VEHICLE_TEXT_FILTERS: DataTableFacetedFilterConfig[] = [
  { columnId: 'domain', title: 'Dominio', type: 'text', placeholder: 'Buscar por dominio...' },
  { columnId: 'serie', title: 'Serie', type: 'text', placeholder: 'Buscar por serie...' },
  { columnId: 'intern_number', title: 'N° Interno', type: 'text', placeholder: 'Buscar por N° interno...' },
];

export const vehicleExportFormatters = {
  vehicleType: (_val: unknown, row: VehicleDialogItem) => row.type_vehicles_typeTotype?.name ?? '-',
  subType: (_val: unknown, row: VehicleDialogItem) => row.sub_type?.name ?? '-',
  condition: (val: unknown) => conditionLabels[String(val ?? '')] ?? String(val ?? '-'),
  contractor_equipment: (_val: unknown, row: VehicleDialogItem) => {
    const names = row.contractor_equipment?.map((c) => c.customers?.name).filter((n): n is string => !!n) ?? [];
    return names.length > 0 ? names.join(', ') : 'Sin afectar';
  },
};

export function getVehicleDialogColumns(conditionVariant: 'success' | 'destructive'): ColumnDef<VehicleDialogItem>[] {
  return [
    {
      id: 'domain',
      accessorKey: 'domain',
      meta: { title: 'Dominio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dominio" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${row.original.id}`}
          target="_blank"
          className="font-medium hover:underline text-primary"
        >
          {row.original.domain ?? '-'}
        </Link>
      ),
    },
    {
      id: 'serie',
      accessorKey: 'serie',
      meta: { title: 'Serie' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Serie" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.serie ?? '-'}</span>,
    },
    {
      id: 'intern_number',
      accessorKey: 'intern_number',
      meta: { title: 'N° Interno' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Interno" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.intern_number ?? '-'}</span>,
    },
    {
      id: 'vehicleType',
      accessorFn: (row) => row.type_vehicles_typeTotype?.name ?? '',
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.type_vehicles_typeTotype?.name ?? '-'}</span>
      ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.type;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'subType',
      accessorFn: (row) => row.sub_type?.name ?? '',
      meta: { title: 'Subtipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subtipo" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.sub_type?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.subType;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'condition',
      accessorKey: 'condition',
      meta: { title: 'Condición' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Condición" />,
      cell: ({ row }) => {
        const condition = row.original.condition;
        const Icon = condition ? conditionIcons[condition] : undefined;
        return (
          <Badge variant={conditionVariant} className="gap-1 text-xs">
            {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
            {conditionLabels[condition ?? ''] ?? condition ?? '-'}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const condition = row.getValue(id) as string | null;
        if (condition == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(condition);
      },
    },
    {
      id: 'contractor_equipment',
      accessorFn: (row) =>
        row.contractor_equipment
          ?.map((c) => c.customers?.name)
          .filter(Boolean)
          .join(', ') ?? '',
      meta: { title: 'Afectaciones' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Afectaciones" />,
      cell: ({ row }) => {
        const names =
          row.original.contractor_equipment?.map((c) => c.customers?.name).filter((n): n is string => !!n) ?? [];
        if (names.length === 0) {
          return <Badge variant="outline">Sin afectar</Badge>;
        }
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" tabIndex={names.length > 1 ? 0 : undefined}>
                  {names[0]}
                  {names.length > 1 && ` +${names.length - 1}`}
                </Badge>
              </TooltipTrigger>
              {names.length > 1 && (
                <TooltipContent>
                  <div className="flex flex-col gap-1">
                    {names.map((name) => (
                      <span key={name}>{name}</span>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const items = row.original.contractor_equipment ?? [];
        if (items.length === 0) return value.includes(NULL_FILTER_VALUE);
        return items.some((c) => c.customers?.id && value.includes(c.customers.id));
      },
    },
  ];
}
