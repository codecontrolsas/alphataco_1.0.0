'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import {
  matchesNullableColumnValue,
  matchesNullableId,
  titled,
} from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import {
  conditionLabels,
  contractTypeVehiclesLabels,
  costTypeLabels,
  currencyLabels,
  otherEquipmentStatusLabels,
} from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import type { OtherEquipmentListItem } from './actions.server';
import {
  ContractorsCell,
  EmptyCell,
  MonoCell,
  conditionIcons,
  conditionVariants,
  getEquipmentHref,
  type BadgeVariant,
} from './column-helpers';

export { conditionIcons };

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  // Su dato ya se ve en la columna 'equipment'
  'intern_number',
  'type',
  'sub_type',
  'brand',
  'model',
  'year',
  // Secundarias
  'owner',
  'type_of_contract',
  'has_certification',
  'linked_vehicle',
  'sector',
  'cost_type',
  'manufacturer_plate',
  'composition',
  'invoice_number',
  'initial_value',
  'currency',
  'purchase_date',
  'cost_center',
  'created_at',
  'certification_expiration_date',
  'certification_number',
];

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const columns: ColumnDef<OtherEquipmentListItem>[] = [
  // ─── N° Serie (identidad de la fila) ─────────────────────────────────────
  {
    accessorKey: 'serial_number',
    ...titled('N° Serie'),
    cell: ({ row }) => (
      <Link
        href={getEquipmentHref(row.original.id)}
        className="font-mono font-semibold tabular-nums text-foreground hover:text-brand-ink hover:underline"
      >
        {row.original.serial_number ?? '-'}
      </Link>
    ),
  },

  // ─── Equipo (identidad compuesta: Marca Modelo / Tipo · Año · N° interno) ─
  {
    id: 'equipment',
    accessorFn: (row) => [row.brand_vehicles?.name, row.model_vehicles?.name].filter(Boolean).join(' '),
    meta: { title: 'Equipo', excludeFromExport: true },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
    cell: ({ row }) => {
      const e = row.original;
      const title = [e.brand_vehicles?.name, e.model_vehicles?.name].filter(Boolean).join(' ');
      const details = [e.type?.name, e.year, e.intern_number ? `N° ${e.intern_number}` : null]
        .filter(Boolean)
        .join(' · ');
      if (!title && !details) return <EmptyCell />;
      return (
        <div className="min-w-0">
          <div className="font-semibold text-foreground">{title || '-'}</div>
          {details && <div className="truncate text-sm text-muted-foreground">{details}</div>}
        </div>
      );
    },
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

  // ─── Documentación (estado documental, enum nullable) ─────────────
  {
    accessorKey: 'status',
    ...titled('Documentación'),
    cell: ({ row }) => {
      const s = row.original.status;
      if (!s) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{otherEquipmentStatusLabels[s] ?? s}</Badge>;
    },
    filterFn: matchesNullableColumnValue,
  },

  // ─── Horómetro ────────────────────────────────────────────────────────────
  {
    accessorKey: 'horometer',
    ...titled('Horas'),
    cell: ({ row }) =>
      row.original.horometer != null ? (
        <span className="font-mono tabular-nums">
          {row.original.horometer.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h
        </span>
      ) : (
        <EmptyCell />
      ),
  },

  // ─── Afectado a (M:M) ───────────────────────────────────────────────────
  {
    id: 'contractor_other_equipment',
    accessorFn: (row) =>
      (row.contractor_other_equipment ?? [])
        .map((c) => c.customers?.name ?? '')
        .filter(Boolean)
        .join(', '),
    ...titled('Afectado a'),
    cell: ({ row }) => {
      const contractors = (row.original.contractor_other_equipment ?? [])
        .map((c) => c.customers?.name ?? '')
        .filter(Boolean);

      return <ContractorsCell names={contractors} />;
    },
    filterFn: (row, _id, filterValue) => {
      if (!filterValue || !Array.isArray(filterValue) || filterValue.length === 0) return true;
      const contractors = row.original.contractor_other_equipment ?? [];
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

  // ─── N° Interno ──────────────────────────────────────────────────────────
  {
    accessorKey: 'intern_number',
    ...titled('N° Interno'),
    cell: ({ row }) => (
      <Link href={getEquipmentHref(row.original.id)} className="font-mono tabular-nums hover:underline">
        {row.original.intern_number ?? '-'}
      </Link>
    ),
  },

  // ─── Tipo (FK UUID) ───────────────────────────────────────────────────────
  {
    id: 'type',
    accessorFn: (row) => row.type?.name ?? '',
    ...titled('Tipo'),
    cell: ({ row }) =>
      row.original.type?.name ? (
        <Badge>{row.original.type.name}</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    filterFn: matchesNullableId((row) => row.type?.id),
  },

  // ─── Subtipo (FK UUID) ────────────────────────────────────────────────────
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

  // ─── Modelo (FK Int nullable) ─────────────────────────────────────────────
  {
    id: 'model',
    accessorFn: (row) => row.model_vehicles?.name ?? '',
    ...titled('Modelo'),
    cell: ({ row }) => (
      <span>{row.original.model_vehicles?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: matchesNullableId((row) => (row.model_id == null ? null : String(row.model_id))),
  },

  // ─── Propietario (FK UUID) ────────────────────────────────────────────────
  {
    id: 'owner',
    accessorFn: (row) => row.equipment_owners?.name ?? '',
    ...titled('Propietario'),
    cell: ({ row }) => (
      <span>{row.original.equipment_owners?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: matchesNullableId((row) => row.equipment_owners?.id),
  },

  // ─── Tipo de contrato (enum nullable) ─────────────────────────────────────
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

  // ─── Marca (FK Int nullable) ──────────────────────────────────────────────
  {
    id: 'brand',
    accessorFn: (row) => row.brand_vehicles?.name ?? '',
    ...titled('Marca'),
    cell: ({ row }) => (
      <span>{row.original.brand_vehicles?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: matchesNullableId((row) => (row.brand_id == null ? null : String(row.brand_id))),
  },

  // ─── Año ─────────────────────────────────────────────────────────────────
  {
    accessorKey: 'year',
    ...titled('Año'),
    cell: ({ row }) => <span>{row.original.year ?? '-'}</span>,
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
    cell: ({ row }) =>
      row.original.certification_expiration_date ? (
        <span>{moment.utc(row.original.certification_expiration_date).format('DD/MM/YYYY')}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── N° de certificación — OCULTA POR DEFAULT ────────────────────────────
  {
    accessorKey: 'certification_number',
    ...titled('N° de certificación'),
    cell: ({ row }) => <MonoCell value={row.original.certification_number} />,
  },

  // ─── Vinculado a (FK UUID) ────────────────────────────────────────────────
  {
    id: 'linked_vehicle',
    accessorFn: (row) => row.vehicles?.domain ?? '',
    ...titled('Vinculado a'),
    cell: ({ row }) => <span>{row.original.vehicles?.domain ?? <span className="text-muted-foreground">-</span>}</span>,
    filterFn: matchesNullableId((row) => row.vehicles?.id),
  },

  // ─── Sector (FK UUID → hierarchy) ────────────────────────────────────────
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

  // ─── Tipo de costo (enum nullable) ───────────────────────────────────────
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

  // ─── Centro de costo (FK UUID) — OCULTA POR DEFAULT ──────────────────────
  {
    id: 'cost_center',
    accessorFn: (row) => row.cost_center?.name ?? '',
    ...titled('Centro de costo'),
    cell: ({ row }) => (
      <span>{row.original.cost_center?.name ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    filterFn: matchesNullableId((row) => row.cost_center?.id),
  },

  // ─── Placa fabricante — OCULTA POR DEFAULT ────────────────────────────────
  {
    accessorKey: 'manufacturer_plate',
    ...titled('Placa fabricante'),
    cell: ({ row }) => <span>{row.original.manufacturer_plate ?? '-'}</span>,
  },

  // ─── Composición — OCULTA POR DEFAULT ────────────────────────────────────
  {
    accessorKey: 'composition',
    ...titled('Composición'),
    cell: ({ row }) => <span>{row.original.composition ?? '-'}</span>,
  },

  // ─── N° Factura — OCULTA POR DEFAULT ─────────────────────────────────────
  {
    accessorKey: 'invoice_number',
    ...titled('N° Factura'),
    cell: ({ row }) => <span>{row.original.invoice_number ?? '-'}</span>,
  },

  // ─── Valor inicial — OCULTA POR DEFAULT ──────────────────────────────────
  {
    accessorKey: 'initial_value',
    ...titled('Valor inicial'),
    cell: ({ row }) =>
      row.original.initial_value != null ? (
        <span>{String(row.original.initial_value)}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── Moneda (enum nullable) — OCULTA POR DEFAULT ────────────────────────
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

  // ─── Fecha de compra — OCULTA POR DEFAULT ────────────────────────────────
  {
    accessorKey: 'purchase_date',
    ...titled('Fecha de compra'),
    cell: ({ row }) =>
      row.original.purchase_date ? (
        <span>{moment.utc(row.original.purchase_date).format('DD/MM/YYYY')}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },

  // ─── Creado — OCULTA POR DEFAULT ─────────────────────────────────────────
  {
    accessorKey: 'created_at',
    ...titled('Creado'),
    cell: ({ row }) =>
      row.original.created_at ? (
        <span>{formatArgentinaDay(row.original.created_at)}</span>
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
        href={`/dashboard/equipment/action?action=view&id=${row.original.id}&type=other`}
        className="text-sm text-muted-foreground hover:text-foreground underline"
      >
        Ver
      </Link>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
