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
import { unwrapExportResult } from '@/shared/lib/export-result';
import { CircleOff, Landmark, Percent, Users, Wallet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { CHECK_KIND_LABELS, CHECK_STATUS_LABELS } from '../../../lib/check-transitions';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { DepositChecksDialog } from '../../components/DepositChecksDialog';
import { DiscountChecksDialog } from '../../components/DiscountChecksDialog';
import { getAllChecksForExport, getCheckSingleFacet, getChecksPaginated, type CheckListItem } from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, checkKindIcons, checkStatusIcons, formatValueDate, getColumns } from '../columns';
import { CHECK_KIND_VALUES, CHECK_STATUS_VALUES } from '../constants';

interface Props {
  data: CheckListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  canOperate: boolean;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'portfolio', 'deposit_deadline'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _ChecksDataTable({
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
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getChecksPaginated(params), []);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [dialog, setDialog] = useState<'deposit' | 'discount' | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setClearTrigger((n) => n + 1);
  }, []);

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
          const result = await getCheckSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: CHECK_STATUS_VALUES.map((value) => ({
              value,
              label: CHECK_STATUS_LABELS[value],
              icon: checkStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'portfolio',
        title: 'Cartera',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getCheckSingleFacet('portfolio', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Wallet })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'deposit_deadline', title: 'Vence para depositar', type: 'dateRange' as const },
      {
        columnId: 'customer',
        title: 'Cliente',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getCheckSingleFacet('customer', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Users })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'kind',
        title: 'Tipo',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getCheckSingleFacet('kind', params);
          if (!result) return EMPTY_FACET;
          return {
            options: CHECK_KIND_VALUES.map((value) => ({ value, label: CHECK_KIND_LABELS[value], icon: checkKindIcons[value] })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'destination',
        title: 'Destino',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getCheckSingleFacet('destination', params);
          if (!result) return EMPTY_FACET;
          const options = (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Landmark }));
          if ((result.counts.get(NULL_FILTER_VALUE) ?? 0) > 0) {
            options.push({ value: NULL_FILTER_VALUE, label: 'Sin destino', icon: CircleOff });
          }
          return { options, counts: result.counts };
        },
      },
      { columnId: 'issue_date', title: 'Emisión', type: 'dateRange' as const },
      { columnId: 'payment_date', title: 'Fecha de pago', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Número de cheque' },
      { columnId: 'bank', title: 'Banco', type: 'text' as const, placeholder: 'Nombre del banco' },
      { columnId: 'drawer_name', title: 'Librador', type: 'text' as const, placeholder: 'Nombre del librador' },
      { columnId: 'drawer_cuit', title: 'CUIT', type: 'text' as const, placeholder: 'CUIT del librador' },
      { columnId: 'amount', title: 'Importe', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
    ],
    []
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<CheckListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllChecksForExport(currentParams)),
      options: { filename: 'cheques', title: 'Cheques', sheetName: 'Cheques' },
      formatters: {
        amount: (value) => formatMoney(String(value)),
        issue_date: (value) => formatValueDate(value as string),
        payment_date: (value) => formatValueDate(value as string),
        deposit_deadline: (value) => formatValueDate(value as string),
      },
    }),
    [currentParams]
  );

  const toolbarActions =
    canOperate && selectedIds.length > 0 ? (
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-8 gap-1" onClick={() => setDialog('deposit')}>
          <Landmark className="h-3.5 w-3.5" />
          Depositar ({selectedIds.length})
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => setDialog('discount')}>
          <Percent className="h-3.5 w-3.5" />
          Descontar ({selectedIds.length})
        </Button>
      </div>
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
        queryKey={[...TREASURY_QUERY_KEYS.checks]}
        onStateChange={handleStateChange}
        // Solo los cheques EN CARTERA se pueden depositar o descontar
        enableRowSelection={canOperate ? (row) => row.original.status === 'IN_PORTFOLIO' : false}
        showRowSelection
        onRowSelectionIdsChange={setSelectedIds}
        clearSelectionTrigger={clearTrigger}
        toolbarActions={toolbarActions}
        searchPlaceholder="Buscar por número, banco, librador, CUIT o cliente"
        emptyMessage="No hay cheques"
        exportConfig={exportConfig}
        data-testid="treasury-checks-table"
      />
      <DepositChecksDialog
        open={dialog === 'deposit'}
        onOpenChange={(open) => setDialog(open ? 'deposit' : null)}
        checkIds={selectedIds}
        onDone={clearSelection}
      />
      <DiscountChecksDialog
        open={dialog === 'discount'}
        onOpenChange={(open) => setDialog(open ? 'discount' : null)}
        checkIds={selectedIds}
        onDone={clearSelection}
      />
    </>
  );
}
