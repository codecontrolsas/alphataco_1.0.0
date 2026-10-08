'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  conditionLabels,
  contractTypeVehiclesLabels,
  costTypeLabels,
  currencyLabels,
  otherEquipmentStatusLabels,
  terminationReasonEquipmentLabels,
} from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Check, CheckCircle2, Clock, Wrench, X, XCircle } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import React from 'react';
import type { VehicleListItem } from './actions/actions.server';

// ============================================================================
// CONDITION CONFIG
// ============================================================================

type ConditionIconMap = Record<string, React.ComponentType<{ className?: string }>>;

export const conditionIcons: ConditionIconMap = {
  operativo: CheckCircle2,
  no_operativo: XCircle,
  en_reparacion: Wrench,
  operativo_condicionado: AlertTriangle,
  en_preparacion: Clock,
};

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'yellow' | 'info';

export const conditionVariants: Record<string, BadgeVariant> = {
  operativo: 'success',
  no_operativo: 'destructive',
  en_reparacion: 'yellow',
  operativo_condicionado: 'info',
  en_preparacion: 'secondary',
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  'chassis',
  'serie',
  'engine',
  'type_of_contract',
  'contract_expiration_date',
  'contract_start_date',
  'contract_number',
  'currency',
  'price',
  'cost_type',
  'cost_center',
  'reason_for_termination',
  'termination_date',
  'created_at',
  'certification_expiration_date',
  'certification_number',
];

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const columns: ColumnDef<VehicleListItem>[] = [
  // ─── Dominio ─────────────────────────────────────────────────────────────
  {
    accessorKey: 'domain',
    meta: { title: 'Dominio', mobile: { role: 'title', priority: 1 } },
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

  // ─── N° Interno ──────────────────────────────────────────────────────────
  {
    accessorKey: 'intern_number',
    meta: { title: 'N° Interno', mobile: { role: 'title', priority: 2 } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="N° Interno" />,
    cell: ({ row }) => (
      <Link href={`/dashboard/equipment/action?action=view&id=${row.original.id}`} className="hover:underline">
        {row.original.intern_number ?? '-'}
      </Link>
    ),
  },

  // ─── Tipo (FK UUID) ───────────────────────────────────────────────────────
  {
    id: 'type',
    accessorFn: (row) => row.type_vehicles_typeTotype?.name ?? '',
    meta: { title: 'Tipo', mobile: { role: 'subtitle' } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
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

  // ─── Subtipo (FK UUID nullable) ───────────────────────────────────────────
  {
    id: 'sub_type',
    accessorFn: (row) => row.sub_type?.name ?? '',
    meta: { title: 'Subtipo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subtipo" />,
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

  // ─── Marca (FK Int nullable) ──────────────────────────────────────────────
  {
    id: 'brand',
    accessorFn: (row) => row.brand_vehicles?.name ?? '',
    meta: { title: 'Marca' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Marca" />,
    cell: ({ row }) => (
      <span>{row.original.brand_vehicles?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.brand;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(id));
    },
  },

  // ─── Modelo (FK Int nullable) ─────────────────────────────────────────────
  {
    id: 'model',
    accessorFn: (row) => row.model_vehicles?.name ?? '',
    meta: { title: 'Modelo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Modelo" />,
    cell: ({ row }) => (
      <span>{row.original.model_vehicles?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.model;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(id));
    },
  },

  // ─── Año ─────────────────────────────────────────────────────────────────
  {
    accessorKey: 'year',
    meta: { title: 'Año' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Año" />,
    cell: ({ row }) => <span>{row.original.year ?? '-'}</span>,
  },

  // ─── Condición (enum nullable) ───────────────────────────────────────────
  {
    accessorKey: 'condition',
    meta: { title: 'Condición', mobile: { role: 'field', priority: 1 } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Condición" />,
    cell: ({ row }) => {
      const cond = row.original.condition;
      if (!cond) return <span className="text-muted-foreground">-</span>;
      const variant = (conditionVariants[cond] ?? 'default') as BadgeVariant;
      const IconComponent = conditionIcons[cond];
      const label = conditionLabels[cond] ?? cond;
      return (
        <Badge variant={variant as 'default'}>
          {IconComponent && <IconComponent className="mr-1 size-3 inline" />}
          {label}
        </Badge>
      );
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── Estado documental (enum nullable) ─────────────────────────────────────
  {
    accessorKey: 'status',
    meta: { title: 'Estado', mobile: { role: 'status' } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => {
      const s = row.original.status;
      if (!s) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{otherEquipmentStatusLabels[s] ?? s}</Badge>;
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── Posee certificación (boolean) ───────────────────────────────────────
  {
    accessorKey: 'has_certification',
    id: 'has_certification',
    meta: { title: 'Posee certificación' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Posee certificación" />,
    cell: ({ row }) =>
      row.original.has_certification ? (
        <Badge variant="success" className="flex w-fit items-center gap-1">
          <Check className="h-3 w-3" />
          Sí
        </Badge>
      ) : (
        <Badge variant="secondary" className="flex w-fit items-center gap-1 opacity-60">
          <X className="h-3 w-3" />
          No
        </Badge>
      ),
    filterFn: (row, id, value: string[]) => {
      return value.includes(String(row.getValue(id)));
    },
  },

  // ─── Vencimiento de certificación — OCULTA POR DEFAULT ───────────────────
  {
    accessorKey: 'certification_expiration_date',
    meta: { title: 'Vencimiento de certificación' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento de certificación" />,
    cell: ({ row }) =>
      row.original.certification_expiration_date ? (
        <span>{moment(row.original.certification_expiration_date).format('DD/MM/YYYY')}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── N° de certificación — OCULTA POR DEFAULT ────────────────────────────
  {
    accessorKey: 'certification_number',
    meta: { title: 'N° de certificación' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="N° de certificación" />,
    cell: ({ row }) => <span>{row.original.certification_number ?? '-'}</span>,
  },

  // ─── Cantidad de Checklist (virtual — ticket 685) ─────────────────────────
  {
    id: 'checklist_count',
    accessorFn: (row) => row._count?.checklist_answers ?? 0,
    meta: { title: 'Cantidad de Checklist' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cantidad de Checklist" />,
    cell: ({ row }) => {
      const count = row.original._count?.checklist_answers ?? 0;
      if (count === 0) {
        return <Badge variant="destructive">Sin checklist</Badge>;
      }
      return <Badge variant="outline">{count}</Badge>;
    },
  },

  // ─── Fecha del último Checklist (virtual — ticket 685) ────────────────────
  {
    id: 'last_checklist_date',
    accessorFn: (row) => row.checklist_answers?.[0]?.created_at ?? null,
    meta: { title: 'Último Checklist' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Último Checklist" />,
    cell: ({ row }) => {
      const lastDate = row.original.checklist_answers?.[0]?.created_at;
      return lastDate ? (
        <span>{moment(lastDate).format('DD/MM/YYYY')}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
    // Prisma no soporta ordenar por MAX(created_at) de una relacion 1:N sin SQL
    // crudo — se deja sin ordenamiento (ver nota en actions.server.ts VALID_SORT_FIELDS).
    enableSorting: false,
  },

  // ─── Kilómetros ───────────────────────────────────────────────────────────
  {
    accessorKey: 'kilometer',
    meta: { title: 'Kilómetros', mobile: { role: 'field', priority: 3, label: 'Km' } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Kilómetros" />,
    cell: ({ row }) =>
      row.original.kilometer != null ? (
        <Badge variant="outline">{row.original.kilometer} km</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── Horómetro ────────────────────────────────────────────────────────────
  {
    accessorKey: 'engine_hours',
    meta: { title: 'Horómetro' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Horómetro" />,
    cell: ({ row }) =>
      row.original.engine_hours != null ? (
        <Badge variant="outline">{row.original.engine_hours} hs</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── Afectaciones (M:M) ───────────────────────────────────────────────────
  {
    id: 'contractor_equipment',
    accessorFn: (row) =>
      (row.contractor_equipment ?? [])
        .map((c) => c.customers?.name ?? '')
        .filter(Boolean)
        .join(', '),
    meta: { title: 'Afectaciones', mobile: { role: 'field', priority: 2 } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Afectaciones" />,
    cell: ({ row }) => {
      const contractors = (row.original.contractor_equipment ?? []).map((c) => c.customers?.name ?? '').filter(Boolean);

      if (contractors.length === 0) return <span className="text-muted-foreground">-</span>;

      const [first, ...rest] = contractors;

      if (rest.length === 0) {
        return <Badge variant="default">{first}</Badge>;
      }

      return (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex">
                <Badge variant="default" className="cursor-pointer select-none">
                  {first} +{rest.length}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-black text-white rounded-lg p-2">
              <div className="flex flex-col gap-1">
                {rest.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    filterFn: (row, _id, filterValue) => {
      if (!filterValue || !Array.isArray(filterValue) || filterValue.length === 0) return true;
      const contractors = row.original.contractor_equipment ?? [];
      if (contractors.length === 0) {
        return (filterValue as string[]).includes(NULL_FILTER_VALUE);
      }
      return contractors.some((c) => {
        const id = c.customers?.id;
        return id && (filterValue as string[]).includes(id);
      });
    },
    enableSorting: false,
  },

  // ─── Propietario (FK UUID nullable) ──────────────────────────────────────
  {
    id: 'owner',
    accessorFn: (row) => row.equipment_owners?.name ?? '',
    meta: { title: 'Propietario' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Propietario" />,
    cell: ({ row }) => (
      <span>{row.original.equipment_owners?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.equipment_owners?.id;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
  },

  // ─── Sector (FK UUID nullable → hierarchy) ────────────────────────────────
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

  // ─── Chassis — OCULTA POR DEFAULT ────────────────────────────────────────
  {
    accessorKey: 'chassis',
    meta: { title: 'Chassis' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Chassis" />,
    cell: ({ row }) => <span>{row.original.chassis ?? '-'}</span>,
  },

  // ─── Motor — OCULTA POR DEFAULT ──────────────────────────────────────────
  {
    accessorKey: 'engine',
    meta: { title: 'Motor' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motor" />,
    cell: ({ row }) => <span>{row.original.engine ?? '-'}</span>,
  },

  // ─── Serie — OCULTA POR DEFAULT ──────────────────────────────────────────
  {
    accessorKey: 'serie',
    meta: { title: 'Serie' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Serie" />,
    cell: ({ row }) => <span>{row.original.serie ?? '-'}</span>,
  },

  // ─── Tipo de contrato (enum nullable) — OCULTA POR DEFAULT ───────────────
  {
    accessorKey: 'type_of_contract',
    meta: { title: 'Tipo de contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de contrato" />,
    cell: ({ row }) => {
      const tc = row.original.type_of_contract;
      if (!tc) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{contractTypeVehiclesLabels[tc] ?? tc}</Badge>;
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── Vencimiento contrato — OCULTA POR DEFAULT ───────────────────────────
  {
    accessorKey: 'contract_expiration_date',
    meta: { title: 'Vencimiento contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento contrato" />,
    cell: ({ row }) =>
      row.original.contract_expiration_date ? (
        <span>{moment(row.original.contract_expiration_date).format('DD/MM/YYYY')}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── Inicio contrato — OCULTA POR DEFAULT ────────────────────────────────
  {
    accessorKey: 'contract_start_date',
    meta: { title: 'Inicio contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Inicio contrato" />,
    cell: ({ row }) =>
      row.original.contract_start_date ? (
        <span>{moment(row.original.contract_start_date).format('DD/MM/YYYY')}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── N° Contrato — OCULTA POR DEFAULT ────────────────────────────────────
  {
    accessorKey: 'contract_number',
    meta: { title: 'N° Contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="N° Contrato" />,
    cell: ({ row }) => <span>{row.original.contract_number ?? '-'}</span>,
  },

  // ─── Moneda (enum nullable) — OCULTA POR DEFAULT ─────────────────────────
  {
    accessorKey: 'currency',
    meta: { title: 'Moneda' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Moneda" />,
    cell: ({ row }) => {
      const c = row.original.currency;
      if (!c) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{currencyLabels[c] ?? c}</Badge>;
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── Precio — OCULTA POR DEFAULT ─────────────────────────────────────────
  {
    accessorKey: 'price',
    meta: { title: 'Precio' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Precio" />,
    cell: ({ row }) =>
      row.original.price != null ? (
        <span>{String(row.original.price)}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── Tipo de costo (enum nullable) — OCULTA POR DEFAULT ──────────────────
  {
    accessorKey: 'cost_type',
    meta: { title: 'Tipo de costo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de costo" />,
    cell: ({ row }) => {
      const ct = row.original.cost_type;
      if (!ct) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{costTypeLabels[ct] ?? ct}</Badge>;
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── Centro de costo (FK UUID nullable) — OCULTA POR DEFAULT ─────────────
  {
    id: 'cost_center',
    accessorFn: (row) => row.cost_center?.name ?? '',
    meta: { title: 'Centro de costo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Centro de costo" />,
    cell: ({ row }) => (
      <span>{row.original.cost_center?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.cost_center?.id;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
  },

  // ─── Motivo de baja (enum nullable) — OCULTA POR DEFAULT ─────────────────
  {
    accessorKey: 'reason_for_termination',
    meta: { title: 'Motivo de baja' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo de baja" />,
    cell: ({ row }) => {
      const r = row.original.reason_for_termination;
      if (!r) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="secondary">{terminationReasonEquipmentLabels[r] ?? r}</Badge>;
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── Fecha de baja — OCULTA POR DEFAULT ──────────────────────────────────
  {
    accessorKey: 'termination_date',
    meta: { title: 'Fecha de baja' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de baja" />,
    cell: ({ row }) =>
      row.original.termination_date ? (
        <span>{moment(row.original.termination_date).format('DD/MM/YYYY')}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── Creado — OCULTA POR DEFAULT ─────────────────────────────────────────
  {
    accessorKey: 'created_at',
    meta: { title: 'Creado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
    cell: ({ row }) =>
      row.original.created_at ? (
        <span>{moment(row.original.created_at).format('DD/MM/YYYY')}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── Acciones ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    meta: { excludeFromExport: true },
    cell: ({ row }) => (
      <Link
        href={`/dashboard/equipment/action?action=view&id=${row.original.id}`}
        className="text-sm text-muted-foreground hover:text-foreground underline"
      >
        Ver
      </Link>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
