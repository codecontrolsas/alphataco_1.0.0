'use client';

import { Button } from '@/components/ui/button';
import { formatMoney } from '@/features/Warehouses/lib/format';
import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { AlarmClock, CalendarClock, CalendarOff, CircleOff, FileText, Banknote, Truck, type LucideIcon } from 'lucide-react';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import {
  getAllDueInvoicesForExport,
  getDueInvoiceSingleFacet,
  getDueInvoicesPaginated,
  type DueInvoiceListItem,
} from '../actions.server';
import { cbteTypeLabel, getColumns } from '../columns';
import {
  DAYS_FILTER_LABELS,
  DAYS_VALUES,
  DUE_CBTE_TYPE_IDS,
  HIDDEN_COLUMNS_BY_DEFAULT,
  NO_ORDER_LABEL,
} from '../constants';

interface Props {
  data: DueInvoiceListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** `permissions['compras:pagos:create']`: muestra "Armar orden de pago". */
  canCreate?: boolean;
  /** Banda de atención resuelta en el servidor; se muestra sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['supplier', 'days', 'due_date'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

const daysIcons: Record<(typeof DAYS_VALUES)[number], LucideIcon> = {
  overdue: AlarmClock,
  upcoming: CalendarClock,
  none: CalendarOff,
};

/** Columnas DATE (sin hora): medianoche UTC, se leen como fecha para no correr un día. */
const dateOnly = (value: unknown) =>
  value ? formatDateAr(new Date(value as string | Date).toISOString().slice(0, 10)) : '';
const money = (value: unknown) => formatMoney(value as string);

export function _DueInvoicesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canCreate = false,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const router = useRouter();
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getDueInvoicesPaginated(params), []);

  // Seleccion: el DataTable entrega los ids (todas las paginas) y las filas de la pagina actual.
  // Se recuerdan las filas vistas para saber el proveedor de lo elegido en otras paginas.
  const knownRows = useRef(new Map<string, DueInvoiceListItem>());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const handleSelectionRows = useCallback((rows: DueInvoiceListItem[]) => {
    for (const row of rows) knownRows.current.set(row.id, row);
  }, []);

  const selectedRows = selectedIds.flatMap((id) => knownRows.current.get(id) ?? []);
  const supplierIds = new Set(selectedRows.map((r) => r.supplier.id));
  const sameSupplier = selectedRows.length > 0 && selectedRows.length === selectedIds.length && supplierIds.size === 1;

  const handleBuildOrder = useCallback(() => {
    const [supplierId] = [...supplierIds];
    if (!supplierId) return;
    // Facturas y cheques rechazados viajan en parametros separados
    const invoiceIds = selectedRows.filter((r) => r.kind === 'INVOICE').map((r) => r.id);
    const checkIds = selectedRows.filter((r) => r.kind === 'CHECK').map((r) => r.id);
    const params = new URLSearchParams({ supplier: supplierId });
    if (invoiceIds.length) params.set('invoices', invoiceIds.join(','));
    if (checkIds.length) params.set('checks', checkIds.join(','));
    router.push(`/dashboard/purchases/payments/new?${params.toString()}`);
  }, [router, supplierIds, selectedRows]);

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const fkFacet =
      (columnId: string, icon: LucideIcon, withNull?: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getDueInvoiceSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
        return {
          options: [
            ...(result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon })),
            ...(withNull && result.counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: withNull, icon: CircleOff }]
              : []),
          ],
          counts: result.counts,
        };
      };

    return [
      { columnId: 'supplier', title: 'Proveedor', fetchFacet: fkFacet('supplier', Truck) },
      {
        columnId: 'days',
        title: 'Días',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getDueInvoiceSingleFacet('days', params);
          if (!result) return EMPTY_FACET;
          return {
            options: DAYS_VALUES.map((value) => ({ value, label: DAYS_FILTER_LABELS[value], icon: daysIcons[value] })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'due_date', title: 'Vencimiento', type: 'dateRange' as const },
      { columnId: 'issue_date', title: 'Fecha de emisión', type: 'dateRange' as const },
      {
        columnId: 'cbte_type',
        title: 'Tipo de comprobante',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getDueInvoiceSingleFacet('cbte_type', params);
          if (!result) return EMPTY_FACET;
          return {
            options: DUE_CBTE_TYPE_IDS.map((id) => ({ value: String(id), label: cbteTypeLabel(id), icon: FileText })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'orders', title: 'Órdenes de pago en curso', fetchFacet: fkFacet('orders', Banknote, NO_ORDER_LABEL) },
      {
        columnId: 'number',
        title: 'Comprobante',
        type: 'text' as const,
        placeholder: 'Ej: 00003-00012345 (exacto)',
      },
      { columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'pending', title: 'Pendiente', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
    ];
  }, []);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<DueInvoiceListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllDueInvoicesForExport(currentParams)),
      options: { filename: 'vencimientos', title: 'Vencimientos', sheetName: 'Vencimientos' },
      formatters: {
        issue_date: dateOnly,
        due_date: dateOnly,
        total: money,
        pending: money,
      },
    }),
    [currentParams]
  );

  const toolbarActions = canCreate ? (
    <div className="flex items-center gap-2">
      {selectedIds.length > 0 && !sameSupplier && (
        <span className="text-xs text-muted-foreground">Elegí comprobantes de un solo proveedor</span>
      )}
      <Button
        type="button"
        size="sm"
        disabled={!sameSupplier}
        title={sameSupplier ? undefined : 'Elegí comprobantes de un solo proveedor'}
        onClick={handleBuildOrder}
      >
        <Banknote className="mr-2 h-4 w-4" />
        Armar orden de pago
      </Button>
    </div>
  ) : undefined;

  return (
    <div className="space-y-4">
      {topSlot}
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        tableId={tableId}
        paramNamespace={tableId}
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        showFilterToggle
        enableRowSelection
        showRowSelection
        onRowSelectionChange={handleSelectionRows}
        onRowSelectionIdsChange={setSelectedIds}
        toolbarActions={toolbarActions}
        queryFn={tableQueryFn}
        queryKey={[...PURCHASES_QUERY_KEYS.dueInvoices]}
        onStateChange={handleStateChange}
        searchPlaceholder="Buscar por comprobante o proveedor"
        emptyMessage="No hay comprobantes pendientes de pago"
        exportConfig={exportConfig}
        data-testid="due-invoices-table"
      />
    </div>
  );
}
