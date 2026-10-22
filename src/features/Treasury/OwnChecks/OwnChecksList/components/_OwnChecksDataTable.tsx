'use client';

import { Button } from '@/components/ui/button';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Building2, CheckCircle2, Landmark } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { OWN_CHECK_KIND_LABELS, OWN_CHECK_STATUS_LABELS } from '../../../lib/own-check-transitions';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { DebitOwnChecksDialog, type DebitableOwnCheck } from '../../components/DebitOwnChecksDialog';
import {
  getAllOwnChecksForExport,
  getOwnCheckSingleFacet,
  getOwnChecksPaginated,
  type OwnCheckListItem,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  formatValueDate,
  getColumns,
  ownCheckKindIcons,
  ownCheckStatusIcons,
} from '../columns';
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

const facets = createFacetFilters(getOwnCheckSingleFacet);

export function _OwnChecksDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canOperate,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
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
        return row
          ? [
              {
                id: row.id,
                number: row.number,
                amount: row.amount ?? '0',
                paymentDate: row.paymentDate,
                accountName: row.account.name,
              },
            ]
          : [];
      }),
    [selectedIds, rowCache]
  );

  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'status',
        'Estado',
        OWN_CHECK_STATUS_VALUES.map((value) => ({
          value,
          label: OWN_CHECK_STATUS_LABELS[value],
          icon: ownCheckStatusIcons[value],
        }))
      ),
      facets.lookup('account', 'Cuenta', Landmark),
      facets.lookup('supplier', 'Proveedor', Building2, { label: 'Sin asignar' }),
      facets.fixed(
        'kind',
        'Tipo',
        OWN_CHECK_KIND_VALUES.map((value) => ({
          value,
          label: OWN_CHECK_KIND_LABELS[value],
          icon: ownCheckKindIcons[value],
        }))
      ),
      { columnId: 'issue_date', title: 'Emisión', type: 'dateRange' as const },
      { columnId: 'payment_date', title: 'Fecha de pago', type: 'dateRange' as const },
      { columnId: 'debited_on', title: 'Débito', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Número de cheque' },
      {
        columnId: 'payment_order',
        title: 'Orden de pago',
        type: 'text' as const,
        placeholder: 'Número de orden de pago',
      },
      { columnId: 'amount', title: 'Importe', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
    ],
    []
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

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
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...TREASURY_QUERY_KEYS.ownChecks]}
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
