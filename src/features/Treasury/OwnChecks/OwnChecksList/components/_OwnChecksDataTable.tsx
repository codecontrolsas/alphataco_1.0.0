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
import { Building2, CheckCircle2, CircleOff, Landmark } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { OWN_CHECK_KIND_LABELS, OWN_CHECK_STATUS_LABELS } from '../../../lib/own-check-transitions';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { DebitOwnChecksDialog, type DebitableOwnCheck } from '../../components/DebitOwnChecksDialog';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { getAllOwnChecksForExport, getOwnCheckSingleFacet, getOwnChecksPaginated, type OwnCheckListItem } from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formatValueDate, getColumns, ownCheckKindIcons, ownCheckStatusIcons } from '../columns';
import { OWN_CHECK_KIND_VALUES, OWN_CHECK_STATUS_VALUES } from '../constants';

interface Props {
  data: OwnCheckListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  canOperate: boolean;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'account', 'supplier'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _OwnChecksDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canOperate,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getOwnChecksPaginated(params), []);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Filas vistas con selección (la selección sobrevive al cambio de página, el callback de filas no)
  const [rowCache, setRowCache] = useState<Record<string, OwnCheckListItem>>({});
  const [clearTrigger, setClearTrigger] = useState(0);
  const [debitOpen, setDebitOpen] = useState(false);

  const handleRowsChange = useCallback((rows: OwnCheckListItem[]) => {
    setRowCache((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.id, r])) }));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setClearTrigger((n) => n + 1);
  }, []);

  const debitable: DebitableOwnCheck[] = useMemo(
    () =>
      selectedIds.flatMap((id) => {
        const row = rowCache[id];
        return row ? [{ id: row.id, number: row.number, amount: row.amount ?? '0', paymentDate: row.paymentDate, accountName: row.account.name }] : [];
      }),
    [selectedIds, rowCache]
  );

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getOwnCheckSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: OWN_CHECK_STATUS_VALUES.map((value) => ({
              value,
              label: OWN_CHECK_STATUS_LABELS[value],
              icon: ownCheckStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'account',
        title: 'Cuenta',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getOwnCheckSingleFacet('account', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Landmark })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'supplier',
        title: 'Proveedor',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getOwnCheckSingleFacet('supplier', params);
          if (!result) return EMPTY_FACET;
          const options = (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Building2 }));
          if ((result.counts.get(NULL_FILTER_VALUE) ?? 0) > 0) {
            options.push({ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff });
          }
          return { options, counts: result.counts };
        },
      },
      {
        columnId: 'kind',
        title: 'Tipo',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getOwnCheckSingleFacet('kind', params);
          if (!result) return EMPTY_FACET;
          return {
            options: OWN_CHECK_KIND_VALUES.map((value) => ({
              value,
              label: OWN_CHECK_KIND_LABELS[value],
              icon: ownCheckKindIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'issue_date', title: 'Emisión', type: 'dateRange' as const },
      { columnId: 'payment_date', title: 'Fecha de pago', type: 'dateRange' as const },
      { columnId: 'debited_on', title: 'Débito', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Número de cheque' },
      { columnId: 'payment_order', title: 'Orden de pago', type: 'text' as const, placeholder: 'Número de orden de pago' },
      { columnId: 'amount', title: 'Importe', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
    ],
    []
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<OwnCheckListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllOwnChecksForExport(currentParams)),
      options: { filename: 'cheques-propios', title: 'Cheques propios', sheetName: 'Cheques propios' },
      formatters: {
        amount: (value) => (value ? formatMoney(String(value)) : ''),
        issue_date: (value) => formatValueDate(value as string),
        payment_date: (value) => formatValueDate(value as string),
        debited_on: (value) => formatValueDate(value as string),
      },
    }),
    [currentParams]
  );

  const toolbarActions =
    canOperate && selectedIds.length > 0 ? (
      <Button type="button" size="sm" className="h-8 gap-1" onClick={() => setDebitOpen(true)}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        Confirmar débito ({selectedIds.length})
      </Button>
    ) : undefined;

  return (
    <>
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
        queryFn={tableQueryFn}
        queryKey={[...TREASURY_QUERY_KEYS.ownChecks]}
        onStateChange={handleStateChange}
        // Solo los cheques EMITIDOS se pueden debitar
        enableRowSelection={canOperate ? (row) => row.original.status === 'ISSUED' : false}
        showRowSelection
        onRowSelectionIdsChange={setSelectedIds}
        onRowSelectionChange={handleRowsChange}
        clearSelectionTrigger={clearTrigger}
        toolbarActions={toolbarActions}
        searchPlaceholder="Buscar por número, proveedor, cuenta u orden de pago"
        emptyMessage="No hay cheques propios"
        exportConfig={exportConfig}
        data-testid="treasury-own-checks-table"
      />
      <DebitOwnChecksDialog open={debitOpen} onOpenChange={setDebitOpen} checks={debitable} onDone={clearSelection} />
    </>
  );
}
