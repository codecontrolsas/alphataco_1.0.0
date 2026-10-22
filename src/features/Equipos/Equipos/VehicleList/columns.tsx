'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import {
  matchesNullableColumnValue,
  matchesNullableId,
  titled,
} from '@/shared/components/common/DataTable/column-helpers';
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
import { Check, Eye, X } from 'lucide-react';
import Link from 'next/link';
import type { VehicleListItem } from './actions/actions.server';
import {
  ContractorsCell,
  DateCell,
  EmptyCell,
  EquipmentCell,
  MonoCell,
  TimestampCell,
  contractorNames,
  equipmentTitle,
} from './components/cells';
import { conditionIcons, conditionVariants, type BadgeVariant } from './lib/condition-config';

// Re-export: los listados de bajas y de equipamiento y `EquipmentConditionControl` importan estos mapas de acá.
export { conditionIcons, conditionVariants } from './lib/condition-config';

// ============================================================================
// HELPERS
// ============================================================================

const getVehicleHref = (id: string) => `/dashboard/equipment/action?action=view&id=${id}`;

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  // Su dato ya se ve en la columna 'equipment'
  'brand',
  'model',
  'type',
  'sub_type',
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
  // ─── Dominio (identidad de la fila) ──────────────────────────────────────
  {
    accessorKey: 'domain',
    ...titled('Dominio'),
    cell: ({ row }) => (
      <Link
        href={getVehicleHref(row.original.id)}
        className="font-mono font-semibold tabular-nums text-foreground hover:text-brand-ink hover:underline"
      >
        {row.original.domain ?? '-'}
      </Link>
    ),
  },

  // ─── Equipo (identidad compuesta: Marca Modelo / Tipo · Año · N° interno) ─
  {
    id: 'equipment',
    accessorFn: (row) => equipmentTitle(row),
    meta: { title: 'Equipo', excludeFromExport: true },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
    cell: ({ row }) => <EquipmentCell vehicle={row.original} />,
    // 'equipment' no es un campo ordenable en actions.server.ts (VALID_SORT_FIELDS)
    enableSorting: false,
  },

  // ─── Condición (enum nullable) ───────────────────────────────────────────
  {
    accessorKey: 'condition',
    ...titled('Condición'),
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
    filterFn: matchesNullableColumnValue,
  },

  // ─── Estado documental (enum nullable) ─────────────────────────────────────
  {
    accessorKey: 'status',
    ...titled('Estado'),
    cell: ({ row }) => {
      const s = row.original.status;
      if (!s) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{otherEquipmentStatusLabels[s] ?? s}</Badge>;
    },
    filterFn: matchesNullableColumnValue,
  },

  // ─── Posee certificación (boolean) ───────────────────────────────────────
  {
    accessorKey: 'has_certification',
    id: 'has_certification',
    ...titled('Posee certificación'),
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
    ...titled('Vencimiento de certificación'),
    cell: ({ row }) => <DateCell value={row.original.certification_expiration_date} />,
  },

  // ─── N° de certificación — OCULTA POR DEFAULT ────────────────────────────
  {
    accessorKey: 'certification_number',
    ...titled('N° de certificación'),
    cell: ({ row }) => <MonoCell value={row.original.certification_number} />,
  },

  // ─── Cantidad de Checklist (virtual — ticket 685) ─────────────────────────
  {
    id: 'checklist_count',
    accessorFn: (row) => row._count?.checklist_answers ?? 0,
    ...titled('Cantidad de Checklist'),
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
    ...titled('Último Checklist'),
    cell: ({ row }) => <TimestampCell value={row.original.checklist_answers?.[0]?.created_at} />,
    // Prisma no soporta ordenar por MAX(created_at) de una relacion 1:N sin SQL
    // crudo — se deja sin ordenamiento (ver nota en actions.server.ts VALID_SORT_FIELDS).
    enableSorting: false,
  },

  // ─── Kilómetros ───────────────────────────────────────────────────────────
  {
    accessorKey: 'kilometer',
    ...titled('Kilómetros'),
    cell: ({ row }) =>
      row.original.kilometer != null ? (
        <span className="font-mono tabular-nums">{row.original.kilometer} km</span>
      ) : (
        <EmptyCell />
      ),
  },

  // ─── Horómetro ────────────────────────────────────────────────────────────
  {
    accessorKey: 'engine_hours',
    ...titled('Horómetro'),
    cell: ({ row }) =>
      row.original.engine_hours != null ? (
        <span className="font-mono tabular-nums">{row.original.engine_hours} hs</span>
      ) : (
        <EmptyCell />
      ),
  },

  // ─── Afectaciones (M:M) ───────────────────────────────────────────────────
  {
    id: 'contractor_equipment',
    accessorFn: (row) => contractorNames(row.contractor_equipment).join(', '),
    ...titled('Afectaciones'),
    cell: ({ row }) => <ContractorsCell names={contractorNames(row.original.contractor_equipment)} />,
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
    ...titled('Propietario'),
    cell: ({ row }) => (
      <span>{row.original.equipment_owners?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: matchesNullableId((row) => row.equipment_owners?.id),
  },

  // ─── Sector (FK UUID nullable → hierarchy) ────────────────────────────────
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

  // ─── N° Interno ──────────────────────────────────────────────────────────
  {
    accessorKey: 'intern_number',
    ...titled('N° Interno'),
    cell: ({ row }) => (
      <Link href={getVehicleHref(row.original.id)} className="font-mono tabular-nums hover:underline">
        {row.original.intern_number ?? '-'}
      </Link>
    ),
  },

  // ─── Tipo (FK UUID) ───────────────────────────────────────────────────────
  {
    id: 'type',
    accessorFn: (row) => row.type_vehicles_typeTotype?.name ?? '',
    ...titled('Tipo'),
    cell: ({ row }) =>
      row.original.type_vehicles_typeTotype?.name ? (
        <Badge>{row.original.type_vehicles_typeTotype.name}</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    filterFn: matchesNullableId((row) => row.type_vehicles_typeTotype?.id),
  },

  // ─── Subtipo (FK UUID nullable) ───────────────────────────────────────────
  {
    id: 'sub_type',
    accessorFn: (row) => row.sub_type?.name ?? '',
    ...titled('Subtipo'),
    cell: ({ row }) =>
      row.original.sub_type?.name ? (
        <Badge variant="secondary">{row.original.sub_type.name}</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    filterFn: matchesNullableId((row) => row.sub_type?.id),
  },

  // ─── Marca (FK Int nullable) ──────────────────────────────────────────────
  {
    id: 'brand',
    accessorFn: (row) => row.brand_vehicles?.name ?? '',
    ...titled('Marca'),
    cell: ({ row }) => (
      <span>{row.original.brand_vehicles?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: matchesNullableId((row) => (row.brand == null ? null : String(row.brand))),
  },

  // ─── Modelo (FK Int nullable) ─────────────────────────────────────────────
  {
    id: 'model',
    accessorFn: (row) => row.model_vehicles?.name ?? '',
    ...titled('Modelo'),
    cell: ({ row }) => (
      <span>{row.original.model_vehicles?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: matchesNullableId((row) => (row.model == null ? null : String(row.model))),
  },

  // ─── Año ─────────────────────────────────────────────────────────────────
  {
    accessorKey: 'year',
    ...titled('Año'),
    cell: ({ row }) => <MonoCell value={row.original.year} />,
  },

  // ─── Chassis — OCULTA POR DEFAULT ────────────────────────────────────────
  {
    accessorKey: 'chassis',
    ...titled('Chassis'),
    cell: ({ row }) => <MonoCell value={row.original.chassis} />,
  },

  // ─── Motor — OCULTA POR DEFAULT ──────────────────────────────────────────
  {
    accessorKey: 'engine',
    ...titled('Motor'),
    cell: ({ row }) => <MonoCell value={row.original.engine} />,
  },

  // ─── Serie — OCULTA POR DEFAULT ──────────────────────────────────────────
  {
    accessorKey: 'serie',
    ...titled('Serie'),
    cell: ({ row }) => <MonoCell value={row.original.serie} />,
  },

  // ─── Tipo de contrato (enum nullable) — OCULTA POR DEFAULT ───────────────
  {
    accessorKey: 'type_of_contract',
    ...titled('Tipo de contrato'),
    cell: ({ row }) => {
      const tc = row.original.type_of_contract;
      if (!tc) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{contractTypeVehiclesLabels[tc] ?? tc}</Badge>;
    },
    filterFn: matchesNullableColumnValue,
  },

  // ─── Vencimiento contrato — OCULTA POR DEFAULT ───────────────────────────
  {
    accessorKey: 'contract_expiration_date',
    ...titled('Vencimiento contrato'),
    cell: ({ row }) => <DateCell value={row.original.contract_expiration_date} />,
  },

  // ─── Inicio contrato — OCULTA POR DEFAULT ────────────────────────────────
  {
    accessorKey: 'contract_start_date',
    ...titled('Inicio contrato'),
    cell: ({ row }) => <DateCell value={row.original.contract_start_date} />,
  },

  // ─── N° Contrato — OCULTA POR DEFAULT ────────────────────────────────────
  {
    accessorKey: 'contract_number',
    ...titled('N° Contrato'),
    cell: ({ row }) => <MonoCell value={row.original.contract_number} />,
  },

  // ─── Moneda (enum nullable) — OCULTA POR DEFAULT ─────────────────────────
  {
    accessorKey: 'currency',
    ...titled('Moneda'),
    cell: ({ row }) => {
      const c = row.original.currency;
      if (!c) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{currencyLabels[c] ?? c}</Badge>;
    },
    filterFn: matchesNullableColumnValue,
  },

  // ─── Precio — OCULTA POR DEFAULT ─────────────────────────────────────────
  {
    accessorKey: 'price',
    ...titled('Precio'),
    cell: ({ row }) =>
      row.original.price != null ? (
        <span className="font-mono tabular-nums">{String(row.original.price)}</span>
      ) : (
        <EmptyCell />
      ),
  },

  // ─── Tipo de costo (enum nullable) — OCULTA POR DEFAULT ──────────────────
  {
    accessorKey: 'cost_type',
    ...titled('Tipo de costo'),
    cell: ({ row }) => {
      const ct = row.original.cost_type;
      if (!ct) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{costTypeLabels[ct] ?? ct}</Badge>;
    },
    filterFn: matchesNullableColumnValue,
  },

  // ─── Centro de costo (FK UUID nullable) — OCULTA POR DEFAULT ─────────────
  {
    id: 'cost_center',
    accessorFn: (row) => row.cost_center?.name ?? '',
    ...titled('Centro de costo'),
    cell: ({ row }) => (
      <span>{row.original.cost_center?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: matchesNullableId((row) => row.cost_center?.id),
  },

  // ─── Motivo de baja (enum nullable) — OCULTA POR DEFAULT ─────────────────
  {
    accessorKey: 'reason_for_termination',
    ...titled('Motivo de baja'),
    cell: ({ row }) => {
      const r = row.original.reason_for_termination;
      if (!r) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="secondary">{terminationReasonEquipmentLabels[r] ?? r}</Badge>;
    },
    filterFn: matchesNullableColumnValue,
  },

  // ─── Fecha de baja — OCULTA POR DEFAULT ──────────────────────────────────
  {
    accessorKey: 'termination_date',
    ...titled('Fecha de baja'),
    cell: ({ row }) => <DateCell value={row.original.termination_date} />,
  },

  // ─── Creado — OCULTA POR DEFAULT ─────────────────────────────────────────
  {
    accessorKey: 'created_at',
    ...titled('Creado'),
    cell: ({ row }) => <TimestampCell value={row.original.created_at} />,
  },

  // ─── Acciones ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    meta: { title: '', excludeFromExport: true },
    cell: ({ row }) => (
      <Button
        asChild
        variant="ghost"
        size="sm"
        aria-label={`Ver detalle del vehículo ${row.original.domain ?? ''}`.trim()}
      >
        <Link href={getVehicleHref(row.original.id)}>
          <Eye className="mr-2 h-4 w-4" />
          Ver
        </Link>
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
