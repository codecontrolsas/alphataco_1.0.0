'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { inMemoryFacetedFilterFn, inMemoryTextFilterFn } from '@/shared/components/common/DataTable/in-memory';
import { type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import { VAT_RATE_LABELS, type VatRateId } from '@/shared/lib/arca/catalogs';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { Check, CheckCircle2, Percent, Ruler, X, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import type { ServiceItemRow } from '../../actions/service-items.server';
import { CustomersTableSkeleton } from '../../fallback/CustomersTableSkeleton';
import { useTablePreferences } from '../../hooks/useTablePreferences';
import { formatItemPrice } from '../../lib/format-price';
import { PriceRevisionsDialog } from './PriceRevisionsDialog';

const TABLE_ID = 'service-items-table';

/** Columnas del detalle fino: arrancan ocultas. */
const HIDDEN_COLUMNS_BY_DEFAULT = ['item_description', 'item_number', 'vat_rate'];
const DEFAULT_VISIBLE_FILTERS = ['item_name', 'status', 'measure_unit'];

const STATUS_LABELS = { true: 'Activo', false: 'Inactivo' } as const;
const STATUS_ICONS = { true: CheckCircle2, false: XCircle } as const;
const YES_NO_LABELS = { true: 'Sí', false: 'No' } as const;
const YES_NO_ICONS = { true: Check, false: X } as const;

export interface ItemsPermissions {
  canUpdate: boolean;
  canViewPrices: boolean;
  canUpdatePrices: boolean;
}

interface ServiceItemsDataTableProps {
  items: ServiceItemRow[];
  permissions: ItemsPermissions;
  onEdit: (item: ServiceItemRow) => void;
  /** Refresca los ítems (y lo que depende de su precio) tras cargar una revisión desde la tabla. */
  onPriceSaved: () => void;
}

function vatLabel(item: ServiceItemRow): string {
  return VAT_RATE_LABELS[item.vat_rate_id as VatRateId] ?? String(item.vat_rate_id);
}

function isActive(item: ServiceItemRow): boolean {
  return item.is_active ?? true;
}

function YesNoBadge({ value }: { value: boolean }) {
  const key = String(value) as keyof typeof YES_NO_LABELS;
  const Icon = YES_NO_ICONS[key];
  return (
    <Badge variant={value ? 'success' : 'destructive'}>
      <Icon aria-hidden="true" />
      {YES_NO_LABELS[key]}
    </Badge>
  );
}

const emptyValue = <span className="text-muted-foreground">-</span>;

/** El precio viaja como texto: se ordena por valor numérico, no alfabético. */
function priceSortingFn(a: Row<ServiceItemRow>, b: Row<ServiceItemRow>, id: string): number {
  return Number(a.getValue<string>(id) || 0) - Number(b.getValue<string>(id) || 0);
}

export function getServiceItemsColumns(
  permissions: ItemsPermissions,
  onEdit: (item: ServiceItemRow) => void,
  onPriceSaved: () => void
): ColumnDef<ServiceItemRow>[] {
  const columns: ColumnDef<ServiceItemRow>[] = [
    {
      accessorKey: 'item_name',
      ...titled('Nombre'),
      cell: ({ row }) => <span className="font-medium">{row.original.item_name}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'status',
      accessorFn: (row) => String(isActive(row)),
      ...titled('Estado'),
      cell: ({ row }) => {
        const active = isActive(row.original);
        const key = String(active) as keyof typeof STATUS_LABELS;
        const Icon = STATUS_ICONS[key];
        return (
          <Badge variant={active ? 'success' : 'destructive'}>
            <Icon aria-hidden="true" />
            {STATUS_LABELS[key]}
          </Badge>
        );
      },
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'needs_personnel',
      accessorFn: (row) => String(row.needs_personnel),
      ...titled('Req. Personal'),
      cell: ({ row }) => <YesNoBadge value={row.original.needs_personnel} />,
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'needs_equipment',
      accessorFn: (row) => String(row.needs_equipment),
      ...titled('Req. Equipos'),
      cell: ({ row }) => <YesNoBadge value={row.original.needs_equipment} />,
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'item_description',
      accessorFn: (row) => row.item_description ?? '',
      ...titled('Descripción'),
      cell: ({ row }) => row.original.item_description || emptyValue,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'code_item',
      accessorFn: (row) => row.code_item ?? '',
      ...titled('Código'),
      cell: ({ row }) => row.original.code_item || emptyValue,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'item_number',
      accessorFn: (row) => row.item_number ?? '',
      ...titled('Número'),
      cell: ({ row }) => row.original.item_number || emptyValue,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'measure_unit',
      accessorFn: (row) => row.measure_units.unit,
      ...titled('UDM'),
      cell: ({ row }) => row.original.measure_units.unit,
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'vat_rate',
      accessorFn: (row) => vatLabel(row),
      ...titled('IVA'),
      cell: ({ row }) => vatLabel(row.original),
      filterFn: inMemoryFacetedFilterFn,
    },
  ];

  // `view_prices` está separado de `view` a propósito: hay roles que administran ítems sin ver importes.
  if (permissions.canViewPrices) {
    columns.push({
      id: 'item_price',
      accessorFn: (row) => row.item_price ?? '',
      ...titled('Precio'),
      sortingFn: priceSortingFn,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="tabular-nums">{formatItemPrice(row.original.item_price)}</span>
          <PriceRevisionsDialog
            serviceItemId={row.original.id}
            itemName={row.original.item_name}
            currentPrice={row.original.item_price}
            canUpdatePrices={permissions.canUpdatePrices}
            onSaved={onPriceSaved}
          />
        </div>
      ),
      filterFn: inMemoryTextFilterFn,
    });
  }

  if (permissions.canUpdate) {
    columns.push({
      id: 'actions',
      meta: { title: 'Acciones', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="link"
          aria-label={`Editar ítem ${row.original.item_name}`}
          onClick={() => onEdit(row.original)}
        >
          Editar
        </Button>
      ),
    });
  }

  return columns;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/**
 * Ítems de un contrato (decenas por contrato): llegan completos, así que se ordenan, filtran y paginan en
 * memoria. Los inactivos van al final mientras el usuario no ordene por otra columna.
 */
export function ServiceItemsDataTable({ items, permissions, onEdit, onPriceSaved }: ServiceItemsDataTableProps) {
  const preferences = useTablePreferences(TABLE_ID);

  const columns = useMemo(
    () => getServiceItemsColumns(permissions, onEdit, onPriceSaved),
    [permissions, onEdit, onPriceSaved]
  );

  const data = useMemo(() => [...items].sort((a, b) => Number(isActive(b)) - Number(isActive(a))), [items]);

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(() => {
    const yesNoOptions = (['true', 'false'] as const).map((value) => ({
      value,
      label: YES_NO_LABELS[value],
      icon: YES_NO_ICONS[value],
    }));
    const filters: DataTableFacetedFilterConfig[] = [
      { columnId: 'item_name', title: 'Nombre', type: 'text', placeholder: 'Buscar por nombre...' },
      {
        columnId: 'status',
        title: 'Estado',
        options: (['true', 'false'] as const).map((value) => ({
          value,
          label: STATUS_LABELS[value],
          icon: STATUS_ICONS[value],
        })),
      },
      { columnId: 'needs_personnel', title: 'Req. Personal', options: yesNoOptions },
      { columnId: 'needs_equipment', title: 'Req. Equipos', options: yesNoOptions },
      { columnId: 'item_description', title: 'Descripción', type: 'text', placeholder: 'Buscar por descripción...' },
      { columnId: 'code_item', title: 'Código', type: 'text', placeholder: 'Buscar por código...' },
      { columnId: 'item_number', title: 'Número', type: 'text', placeholder: 'Buscar por número...' },
      {
        columnId: 'measure_unit',
        title: 'UDM',
        options: sortedUnique(items.map((item) => item.measure_units.unit)).map((unit) => ({
          value: unit,
          label: unit,
          icon: Ruler,
        })),
      },
      {
        columnId: 'vat_rate',
        title: 'IVA',
        options: sortedUnique(items.map(vatLabel)).map((label) => ({ value: label, label, icon: Percent })),
      },
    ];
    if (permissions.canViewPrices) {
      filters.push({ columnId: 'item_price', title: 'Precio', type: 'text', placeholder: 'Buscar por precio...' });
    }
    return filters;
  }, [items, permissions.canViewPrices]);

  const initialColumnVisibility = useMemo(() => {
    const saved = preferences.data?.columnVisibility;
    if (saved && Object.keys(saved).length > 0) return saved;
    return Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((id) => [id, false]));
  }, [preferences.data]);

  const initialFilterVisibility = useMemo(() => {
    const saved = preferences.data?.filterVisibility;
    if (saved && Object.keys(saved).length > 0) return saved;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [preferences.data, facetedFilters]);

  if (preferences.isPending) return <CustomersTableSkeleton rows={4} />;

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={data.length}
      searchParams={{}}
      inMemory
      mobileCards
      tableId={TABLE_ID}
      paramNamespace={TABLE_ID}
      facetedFilters={facetedFilters}
      initialColumnVisibility={initialColumnVisibility}
      initialFilterVisibility={initialFilterVisibility}
      searchPlaceholder="Buscar por nombre, código o descripción"
      showSearch
      showFilterToggle
      emptyMessage="Este contrato no tiene ítems cargados"
      data-testid="service-items-table"
      rowClassName={(item) => (isActive(item) ? '' : 'opacity-60')}
      exportConfig={{
        fetchAllData: async () => data,
        options: { filename: 'items-contrato', title: 'Ítems del contrato', sheetName: 'Ítems' },
        formatters: {
          status: (_value, row) => (isActive(row) ? 'Activo' : 'Inactivo'),
          needs_personnel: (_value, row) => (row.needs_personnel ? 'Sí' : 'No'),
          needs_equipment: (_value, row) => (row.needs_equipment ? 'Sí' : 'No'),
          // Exporta el importe como número para que Excel lo sume; `null` (sin `view_prices`) queda vacío.
          item_price: (_value, row) => (row.item_price === null ? null : Number(row.item_price)),
        },
      }}
    />
  );
}
