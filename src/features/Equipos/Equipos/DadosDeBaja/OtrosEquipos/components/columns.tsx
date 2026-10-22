'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  costTypeLabels,
  currencyLabels,
  otherEquipmentStatusLabels,
  terminationReasonEquipmentLabels,
} from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { conditionIcons, conditionVariants } from '../../../VehicleList/columns';
import type { InactiveOtherEquipmentListItem } from '../actions/actions.server';

// ============================================================================
// HELPERS
// ============================================================================

const getEquipmentHref = (id: string) => `/dashboard/equipment/action?action=view&id=${id}&type=other`;

function EmptyCell() {
  return <span className="text-muted-foreground">-</span>;
}

/** Fecha @db.Date: llega como medianoche UTC, se lee en UTC para no correrla un día. */
function DateCell({ value }: { value: Date | string | null | undefined }) {
  if (!value) return <EmptyCell />;
  return <span className="font-mono tabular-nums">{moment.utc(value).format('DD/MM/YYYY')}</span>;
}

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

/**
 * Para la tabla de dados de baja, las columnas de baja (reason/date) son VISIBLES
 * por defecto porque son el dato más relevante de estos registros.
 * Las columnas financieras y operativas secundarias se ocultan.
 */
export const HIDDEN_COLUMNS_BY_DEFAULT = [
  // Su dato ya se ve en la columna 'equipment'
  'intern_number',
  'type',
  'brand',
  'model',
  'year',
  // Secundarias
  'condition',
  'status',
  'contractor_other_equipment',
  'linked_vehicle',
  'sub_type',
  'owner',
  'sector',
  'manufacturer_plate',
  'composition',
  'invoice_number',
  'initial_value',
  'currency',
  'purchase_date',
  'cost_center',
  'cost_type',
  'created_at',
];

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const columns: ColumnDef<InactiveOtherEquipmentListItem>[] = [
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

  // ─── Motivo de baja (enum nullable) — VISIBLE POR DEFAULT en tabla de bajas
  {
    accessorKey: 'reason_for_termination',
    ...titled('Motivo de baja'),
    cell: ({ row }) => {
      const r = row.original.reason_for_termination;
      if (!r) return <EmptyCell />;
      return <span>{terminationReasonEquipmentLabels[r] ?? r}</span>;
    },
    filterFn: matchesNullableColumnValue,
  },

  // ─── Fecha de baja ────────────────────────────────────────────────────────
  {
    accessorKey: 'termination_date',
    ...titled('Fecha de baja'),
    cell: ({ row }) => <DateCell value={row.original.termination_date} />,
  },

  // ─── Horas (horómetro) ────────────────────────────────────────────────────
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

  // ─── N° Interno — OCULTA POR DEFAULT ──────────────────────────────────────────────────────────
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

  // ─── Año ─────────────────────────────────────────────────────────────────
  {
    accessorKey: 'year',
    ...titled('Año'),
    cell: ({ row }) => <span>{row.original.year ?? '-'}</span>,
  },

  // ─── Condición (enum nullable) ───────────────────────────────────────────
  {
    accessorKey: 'condition',
    ...titled('Condición'),
    cell: ({ row }) => {
      const cond = row.original.condition;
      if (!cond) return <span className="text-muted-foreground">-</span>;
      const variant = conditionVariants[cond] ?? 'default';
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

  // ─── Vinculado a (FK UUID) ────────────────────────────────────────────────
  {
    id: 'linked_vehicle',
    accessorFn: (row) => row.vehicles?.domain ?? '',
    ...titled('Vinculado a'),
    cell: ({ row }) => <span>{row.original.vehicles?.domain ?? <span className="text-muted-foreground">-</span>}</span>,
    filterFn: matchesNullableId((row) => row.vehicles?.id),
  },

  // ─── Afectaciones (M:M) ───────────────────────────────────────────────────
  {
    id: 'contractor_other_equipment',
    accessorFn: (row) =>
      (row.contractor_other_equipment ?? [])
        .map((c) => c.customers?.name ?? '')
        .filter(Boolean)
        .join(', '),
    ...titled('Afectaciones'),
    cell: ({ row }) => {
      const contractors = (row.original.contractor_other_equipment ?? [])
        .map((c) => c.customers?.name ?? '')
        .filter(Boolean);

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
    meta: { title: '', excludeFromExport: true },
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Acciones del equipo">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={getEquipmentHref(row.original.id)}>
              <Eye className="mr-2 size-4" />
              Ver ficha
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
