'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
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
import { Eye, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import {
  ContractorsCell,
  DateCell,
  EmptyCell,
  EquipmentCell,
  TimestampCell,
  contractorNames,
  equipmentTitle,
} from '../../../VehicleList/components/cells';
import { conditionIcons, conditionVariants } from '../../../VehicleList/lib/condition-config';
import type { InactiveVehicleListItem } from '../actions/actions.server';

// ============================================================================
// HELPERS
// ============================================================================

const getEquipmentHref = (id: string) => `/dashboard/equipment/action?action=view&id=${id}`;

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

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
  'engine_hours',
  'contractor_equipment',
  'chassis',
  'engine',
  'serie',
  'sub_type',
  'cost_type',
  'currency',
  'price',
  'type_of_contract',
  'contract_number',
  'contract_start_date',
  'contract_expiration_date',
  'cost_center',
  'owner',
  'sector',
  'created_at',
];

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const columns: ColumnDef<InactiveVehicleListItem>[] = [
  // ─── Dominio (identidad de la fila) ──────────────────────────────────────
  {
    accessorKey: 'domain',
    meta: { title: 'Dominio' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dominio" />,
    cell: ({ row }) => (
      <Link
        href={getEquipmentHref(row.original.id)}
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

  // ─── Motivo de baja (enum nullable) ─────────────────────────────────────
  {
    accessorKey: 'reason_for_termination',
    meta: { title: 'Motivo de baja' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo de baja" />,
    cell: ({ row }) => {
      const r = row.original.reason_for_termination;
      if (!r) return <EmptyCell />;
      return <span>{terminationReasonEquipmentLabels[r] ?? r}</span>;
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── Fecha de baja ────────────────────────────────────────────────────────
  {
    accessorKey: 'termination_date',
    meta: { title: 'Fecha de baja' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de baja" />,
    cell: ({ row }) => <DateCell value={row.original.termination_date} />,
  },

  // ─── Kilómetros ───────────────────────────────────────────────────────────
  {
    accessorKey: 'kilometer',
    meta: { title: 'Kilómetros' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Kilómetros" />,
    cell: ({ row }) => {
      const km = row.original.kilometer;
      if (km == null || km === '') return <EmptyCell />;
      const value = Number(km);
      return (
        <span className="font-mono tabular-nums">{Number.isFinite(value) ? value.toLocaleString('es-AR') : km} km</span>
      );
    },
  },

  // ─── N° Interno — OCULTA POR DEFAULT ─────────────────────────────────────
  {
    accessorKey: 'intern_number',
    meta: { title: 'N° Interno' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="N° Interno" />,
    cell: ({ row }) => (
      <Link href={getEquipmentHref(row.original.id)} className="font-mono tabular-nums hover:underline">
        {row.original.intern_number ?? '-'}
      </Link>
    ),
  },

  // ─── Tipo (FK UUID) ───────────────────────────────────────────────────────
  {
    id: 'type',
    accessorFn: (row) => row.type_vehicles_typeTotype?.name ?? '',
    meta: { title: 'Tipo' },
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

  // ─── Subtipo (FK UUID) ────────────────────────────────────────────────────
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
    meta: { title: 'Condición' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Condición" />,
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
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── Estado documental (enum nullable) ──────────────────────────────────
  {
    accessorKey: 'status',
    meta: { title: 'Estado' },
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

  // ─── Horómetro ────────────────────────────────────────────────────────────
  {
    accessorKey: 'engine_hours',
    meta: { title: 'Horómetro' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Horómetro" />,
    cell: ({ row }) =>
      row.original.engine_hours != null ? (
        <span className="font-mono tabular-nums">{row.original.engine_hours} hs</span>
      ) : (
        <EmptyCell />
      ),
  },

  // ─── Afectaciones (M:M → customers) ──────────────────────────────────────
  {
    id: 'contractor_equipment',
    accessorFn: (row) => contractorNames(row.contractor_equipment).join(', '),
    meta: { title: 'Afectaciones' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Afectaciones" />,
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

  // ─── Tipo de costo (enum nullable) — OCULTA POR DEFAULT ─────────────────
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

  // ─── Tipo de contrato (enum nullable) — OCULTA POR DEFAULT ───────────────
  {
    accessorKey: 'type_of_contract',
    meta: { title: 'Tipo de contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de contrato" />,
    cell: ({ row }) => {
      const c = row.original.type_of_contract;
      if (!c) return <span className="text-muted-foreground">-</span>;
      return <Badge variant="outline">{contractTypeVehiclesLabels[c] ?? c}</Badge>;
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id);
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val as string);
    },
  },

  // ─── N° Contrato — OCULTA POR DEFAULT ────────────────────────────────────
  {
    accessorKey: 'contract_number',
    meta: { title: 'N° Contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="N° Contrato" />,
    cell: ({ row }) => <span>{row.original.contract_number ?? '-'}</span>,
  },

  // ─── Inicio de contrato — OCULTA POR DEFAULT ─────────────────────────────
  {
    accessorKey: 'contract_start_date',
    meta: { title: 'Inicio de contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Inicio de contrato" />,
    cell: ({ row }) => <DateCell value={row.original.contract_start_date} />,
  },

  // ─── Vencimiento de contrato — OCULTA POR DEFAULT ────────────────────────
  {
    accessorKey: 'contract_expiration_date',
    meta: { title: 'Vencimiento de contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento de contrato" />,
    cell: ({ row }) => <DateCell value={row.original.contract_expiration_date} />,
  },

  // ─── Centro de costo (FK UUID) — OCULTA POR DEFAULT ──────────────────────
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

  // ─── Propietario (FK UUID) — OCULTA POR DEFAULT ──────────────────────────
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

  // ─── Sector (FK UUID → hierarchy) — OCULTA POR DEFAULT ──────────────────
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

  // ─── Creado — OCULTA POR DEFAULT ─────────────────────────────────────────
  {
    accessorKey: 'created_at',
    meta: { title: 'Creado' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
    cell: ({ row }) => <TimestampCell value={row.original.created_at} />,
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
