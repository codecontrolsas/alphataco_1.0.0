'use client';

import {
  matchesNullableColumnValue,
  matchesNullableId,
  titled,
} from '@/shared/components/common/DataTable/column-helpers';
import {
  conditionLabels,
  contractTypeVehiclesLabels,
  costTypeLabels,
  currencyLabels,
  otherEquipmentStatusLabels,
  terminationReasonEquipmentLabels,
} from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import {
  ConditionCell,
  ContractorsCell,
  DateCell,
  EmptyCell,
  EquipmentCell,
  LabelBadgeCell,
  NameBadgeCell,
  NameCell,
  TimestampCell,
  ViewRecordMenu,
  contractorNames,
  equipmentTitle,
  matchesContractor,
} from '../../../../components/cells';
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
    ...titled('Dominio'),
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
    ...titled('Equipo', { excludeFromExport: true }),
    cell: ({ row }) => <EquipmentCell vehicle={row.original} />,
    // 'equipment' no es un campo ordenable en actions.server.ts (VALID_SORT_FIELDS)
    enableSorting: false,
  },

  // ─── Motivo de baja (enum nullable) ─────────────────────────────────────
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

  // ─── Kilómetros ───────────────────────────────────────────────────────────
  {
    accessorKey: 'kilometer',
    ...titled('Kilómetros'),
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
    accessorFn: (row) => row.type_vehicles_typeTotype?.name ?? '',
    ...titled('Tipo'),
    cell: ({ row }) => <NameBadgeCell name={row.original.type_vehicles_typeTotype?.name} />,
    filterFn: matchesNullableId((row) => row.type_vehicles_typeTotype?.id),
  },

  // ─── Subtipo (FK UUID) ────────────────────────────────────────────────────
  {
    id: 'sub_type',
    accessorFn: (row) => row.sub_type?.name ?? '',
    ...titled('Subtipo'),
    cell: ({ row }) => <NameBadgeCell name={row.original.sub_type?.name} variant="secondary" />,
    filterFn: matchesNullableId((row) => row.sub_type?.id),
  },

  // ─── Marca (FK Int nullable) ──────────────────────────────────────────────
  {
    id: 'brand',
    accessorFn: (row) => row.brand_vehicles?.name ?? '',
    ...titled('Marca'),
    cell: ({ row }) => <NameCell name={row.original.brand_vehicles?.name} />,
    filterFn: matchesNullableId((row) => (row.brand == null ? null : String(row.brand))),
  },

  // ─── Modelo (FK Int nullable) ─────────────────────────────────────────────
  {
    id: 'model',
    accessorFn: (row) => row.model_vehicles?.name ?? '',
    ...titled('Modelo'),
    cell: ({ row }) => <NameCell name={row.original.model_vehicles?.name} />,
    filterFn: matchesNullableId((row) => (row.model == null ? null : String(row.model))),
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
    cell: ({ row }) => <ConditionCell condition={row.original.condition} labels={conditionLabels} />,
    filterFn: matchesNullableColumnValue,
  },

  // ─── Estado documental (enum nullable) ──────────────────────────────────
  {
    accessorKey: 'status',
    ...titled('Estado'),
    cell: ({ row }) => <LabelBadgeCell value={row.original.status} labels={otherEquipmentStatusLabels} />,
    filterFn: matchesNullableColumnValue,
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

  // ─── Afectaciones (M:M → customers) ──────────────────────────────────────
  {
    id: 'contractor_equipment',
    accessorFn: (row) => contractorNames(row.contractor_equipment).join(', '),
    ...titled('Afectaciones'),
    cell: ({ row }) => <ContractorsCell names={contractorNames(row.original.contractor_equipment)} />,
    filterFn: matchesContractor((row) => row.contractor_equipment),
    enableSorting: false,
  },

  // ─── Chassis — OCULTA POR DEFAULT ────────────────────────────────────────
  {
    accessorKey: 'chassis',
    ...titled('Chassis'),
    cell: ({ row }) => <span>{row.original.chassis ?? '-'}</span>,
  },

  // ─── Motor — OCULTA POR DEFAULT ──────────────────────────────────────────
  {
    accessorKey: 'engine',
    ...titled('Motor'),
    cell: ({ row }) => <span>{row.original.engine ?? '-'}</span>,
  },

  // ─── Serie — OCULTA POR DEFAULT ──────────────────────────────────────────
  {
    accessorKey: 'serie',
    ...titled('Serie'),
    cell: ({ row }) => <span>{row.original.serie ?? '-'}</span>,
  },

  // ─── Tipo de costo (enum nullable) — OCULTA POR DEFAULT ─────────────────
  {
    accessorKey: 'cost_type',
    ...titled('Tipo de costo'),
    cell: ({ row }) => <LabelBadgeCell value={row.original.cost_type} labels={costTypeLabels} />,
    filterFn: matchesNullableColumnValue,
  },

  // ─── Moneda (enum nullable) — OCULTA POR DEFAULT ─────────────────────────
  {
    accessorKey: 'currency',
    ...titled('Moneda'),
    cell: ({ row }) => <LabelBadgeCell value={row.original.currency} labels={currencyLabels} />,
    filterFn: matchesNullableColumnValue,
  },

  // ─── Precio — OCULTA POR DEFAULT ─────────────────────────────────────────
  {
    accessorKey: 'price',
    ...titled('Precio'),
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
    ...titled('Tipo de contrato'),
    cell: ({ row }) => <LabelBadgeCell value={row.original.type_of_contract} labels={contractTypeVehiclesLabels} />,
    filterFn: matchesNullableColumnValue,
  },

  // ─── N° Contrato — OCULTA POR DEFAULT ────────────────────────────────────
  {
    accessorKey: 'contract_number',
    ...titled('N° Contrato'),
    cell: ({ row }) => <span>{row.original.contract_number ?? '-'}</span>,
  },

  // ─── Inicio de contrato — OCULTA POR DEFAULT ─────────────────────────────
  {
    accessorKey: 'contract_start_date',
    ...titled('Inicio de contrato'),
    cell: ({ row }) => <DateCell value={row.original.contract_start_date} />,
  },

  // ─── Vencimiento de contrato — OCULTA POR DEFAULT ────────────────────────
  {
    accessorKey: 'contract_expiration_date',
    ...titled('Vencimiento de contrato'),
    cell: ({ row }) => <DateCell value={row.original.contract_expiration_date} />,
  },

  // ─── Centro de costo (FK UUID) — OCULTA POR DEFAULT ──────────────────────
  {
    id: 'cost_center',
    accessorFn: (row) => row.cost_center?.name ?? '',
    ...titled('Centro de costo'),
    cell: ({ row }) => <NameCell name={row.original.cost_center?.name} />,
    filterFn: matchesNullableId((row) => row.cost_center?.id),
  },

  // ─── Propietario (FK UUID) — OCULTA POR DEFAULT ──────────────────────────
  {
    id: 'owner',
    accessorFn: (row) => row.equipment_owners?.name ?? '',
    ...titled('Propietario'),
    cell: ({ row }) => <NameCell name={row.original.equipment_owners?.name} />,
    filterFn: matchesNullableId((row) => row.equipment_owners?.id),
  },

  // ─── Sector (FK UUID → hierarchy) — OCULTA POR DEFAULT ──────────────────
  {
    id: 'sector',
    accessorFn: (row) => row.hierarchy?.name ?? '',
    ...titled('Sector'),
    cell: ({ row }) => <NameBadgeCell name={row.original.hierarchy?.name} variant="secondary" />,
    filterFn: matchesNullableId((row) => row.hierarchy?.id),
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
    cell: ({ row }) => <ViewRecordMenu href={getEquipmentHref(row.original.id)} />,
    enableSorting: false,
    enableHiding: false,
  },
];
