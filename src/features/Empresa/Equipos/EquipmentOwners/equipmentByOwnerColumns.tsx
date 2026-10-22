'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { conditionLabels, otherEquipmentStatusLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, AlertTriangle, CheckCircle2, Settings2, Wrench, XCircle } from 'lucide-react';
import Link from 'next/link';
import { ActiveStatusBadge } from '../../components/ActiveStatusBadge';
import type { VehicleByOwnerListItem } from './lib/owners-types';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const VEHICLE_HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'chassis',
  'engine',
  'serie',
  'brand',
  'model',
  'kilometer',
  'engine_hours',
  'subType',
  'created_at',
  'is_active',
];

// ============================================================================
// CONDITION CONFIG — iconos y variantes para condition_enum
// ============================================================================

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'yellow' | 'info' | 'outline';

export const conditionBadgeVariant: Record<string, BadgeVariant> = {
  operativo: 'success',
  no_operativo: 'destructive',
  en_reparacion: 'yellow',
  operativo_condicionado: 'info',
  en_preparacion: 'secondary',
};

export const conditionIcons: Record<string, LucideIcon> = {
  operativo: CheckCircle2,
  no_operativo: XCircle,
  en_reparacion: Wrench,
  operativo_condicionado: AlertTriangle,
  en_preparacion: Settings2,
};

export const statusBadgeVariant: Record<string, BadgeVariant> = {
  Avalado: 'success',
  No_avalado: 'destructive',
  Incompleto: 'destructive',
  Completo: 'success',
  Completo_con_doc_vencida: 'yellow',
};

export const statusIcons: Record<string, LucideIcon> = {
  Avalado: CheckCircle2,
  No_avalado: XCircle,
  Incompleto: AlertCircle,
  Completo: CheckCircle2,
  Completo_con_doc_vencida: AlertTriangle,
};

// ============================================================================
// COLUMNS — Tabla secundaria de equipos por titular
// ============================================================================

export function getVehicleByOwnerColumns(): ColumnDef<VehicleByOwnerListItem>[] {
  return [
    // ── Dominio ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'domain',
      ...titled('Dominio'),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${row.original.id}`}
          className="hover:underline font-medium"
        >
          {row.original.domain ?? '-'}
        </Link>
      ),
    },

    // ── Número interno ───────────────────────────────────────────────────────
    {
      accessorKey: 'intern_number',
      ...titled('Número interno'),
      cell: ({ row }) => (
        <Link href={`/dashboard/equipment/action?action=view&id=${row.original.id}`} className="hover:underline">
          {row.original.intern_number ?? '-'}
        </Link>
      ),
    },

    // ── Tipo (FK UUID) ───────────────────────────────────────────────────────
    {
      id: 'type',
      accessorFn: (row) => row.type_vehicles_typeTotype?.name ?? '',
      ...titled('Tipo'),
      cell: ({ row }) => {
        const name = row.original.type_vehicles_typeTotype?.name;
        return name ? <Badge variant="outline">{name}</Badge> : <span className="text-muted-foreground">-</span>;
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.type_vehicles_typeTotype?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Subtipo (FK UUID nullable) ────────────────────────────────────────────
    {
      id: 'subType',
      accessorFn: (row) => row.sub_type?.name ?? '',
      ...titled('Subtipo'),
      cell: ({ row }) => {
        const name = row.original.sub_type?.name;
        return name ? <Badge variant="outline">{name}</Badge> : <span className="text-muted-foreground">-</span>;
      },
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.sub_type?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Marca (FK BigInt nullable) ────────────────────────────────────────────
    {
      id: 'brand',
      accessorFn: (row) => row.brand_vehicles?.name ?? '',
      ...titled('Marca'),
      cell: ({ row }) => <span>{row.original.brand_vehicles?.name ?? '-'}</span>,
      enableSorting: false,
    },

    // ── Modelo (FK BigInt nullable) ───────────────────────────────────────────
    {
      id: 'model',
      accessorFn: (row) => row.model_vehicles?.name ?? '',
      ...titled('Modelo'),
      cell: ({ row }) => <span>{row.original.model_vehicles?.name ?? '-'}</span>,
      enableSorting: false,
    },

    // ── Año ──────────────────────────────────────────────────────────────────
    {
      accessorKey: 'year',
      ...titled('Año'),
      cell: ({ row }) => <span>{row.original.year ?? '-'}</span>,
    },

    // ── Condición (enum nullable) ────────────────────────────────────────────
    {
      accessorKey: 'condition',
      ...titled('Condición'),
      cell: ({ row }) => {
        const val = row.original.condition as string | null;
        if (!val) return <span className="text-muted-foreground">-</span>;
        const label = conditionLabels[val] ?? val;
        const variant = conditionBadgeVariant[val] ?? 'default';
        const Icon = conditionIcons[val];
        return (
          <Badge variant={variant} className="flex items-center gap-1 w-fit">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Estado documental (enum nullable) ────────────────────────────────────
    {
      accessorKey: 'status',
      ...titled('Estado documental'),
      cell: ({ row }) => {
        const val = row.original.status as string | null;
        if (!val) return <span className="text-muted-foreground">-</span>;
        const label = otherEquipmentStatusLabels[val] ?? val;
        const variant = statusBadgeVariant[val] ?? 'default';
        const Icon = statusIcons[val];
        return (
          <Badge variant={variant} className="flex items-center gap-1 w-fit">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Chassis (oculta por defecto) ──────────────────────────────────────────
    {
      accessorKey: 'chassis',
      ...titled('Chassis'),
      cell: ({ row }) => <span>{row.original.chassis ?? '-'}</span>,
    },

    // ── Motor (oculta por defecto) ────────────────────────────────────────────
    {
      accessorKey: 'engine',
      ...titled('Motor'),
      cell: ({ row }) => <span>{row.original.engine ?? '-'}</span>,
    },

    // ── Serie (oculta por defecto) ────────────────────────────────────────────
    {
      accessorKey: 'serie',
      ...titled('Serie'),
      cell: ({ row }) => <span>{row.original.serie ?? '-'}</span>,
    },

    // ── Kilómetros (oculta por defecto) ──────────────────────────────────────
    {
      accessorKey: 'kilometer',
      ...titled('Kilómetros'),
      cell: ({ row }) => <Badge variant="outline">{row.original.kilometer ?? '0'} km</Badge>,
    },

    // ── Horómetro (oculta por defecto) ───────────────────────────────────────
    {
      accessorKey: 'engine_hours',
      ...titled('Horómetro'),
      cell: ({ row }) => <Badge variant="outline">{row.original.engine_hours ?? '0'} hs</Badge>,
    },

    // ── Afectado a (M:M contractor_equipment → customers) ────────────────────
    {
      id: 'afectadoA',
      accessorFn: (row) =>
        row.contractor_equipment
          ?.map((c) => c.customers?.name ?? '')
          .filter(Boolean)
          .join(', ') ?? '',
      ...titled('Afectado a'),
      cell: ({ row }) => {
        const contractors = row.original.contractor_equipment ?? [];
        const names = contractors.map((c) => c.customers?.name ?? '').filter(Boolean);
        if (names.length === 0) return <span className="text-muted-foreground">Sin afectar</span>;
        const [first, ...rest] = names;
        if (rest.length === 0) return <Badge variant="default">{first}</Badge>;
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="default" className="cursor-pointer select-none">
                  {first} +{rest.length}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="p-2">
                <div className="flex flex-col gap-1">
                  {rest.map((name) => (
                    <p key={name}>{name}</p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      enableSorting: false,
    },

    // ── Estado activo (oculta por defecto) ────────────────────────────────────
    {
      accessorKey: 'is_active',
      ...titled('Estado'),
      cell: ({ row }) => <ActiveStatusBadge value={row.original.is_active} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        if (val === null || val === undefined) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },
  ];
}
