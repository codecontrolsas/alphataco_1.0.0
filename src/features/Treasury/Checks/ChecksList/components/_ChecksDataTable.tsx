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
import { Landmark, Percent, Users, Wallet } from 'lucide-react';
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

const facets = createFacetFilters(getCheckSingleFacet);

export function _ChecksDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canOperate,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getChecksPaginated(params), []);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [dialog, setDialog] = useState<'deposit' | 'discount' | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setClearTrigger((n) => n + 1);
  }, []);

  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'status',
        'Estado',
        CHECK_STATUS_VALUES.map((value) => ({
          value,
          label: CHECK_STATUS_LABELS[value],
          icon: checkStatusIcons[value],
        }))
      ),
      facets.lookup('portfolio', 'Cartera', Wallet),
      { columnId: 'deposit_deadline', title: 'Vence para depositar', type: 'dateRange' as const },
      facets.lookup('customer', 'Cliente', Users),
      facets.fixed(
        'kind',
        'Tipo',
        CHECK_KIND_VALUES.map((value) => ({
          value,
          label: CHECK_KIND_LABELS[value],
          icon: checkKindIcons[value],
        }))
      ),
      facets.lookup('destination', 'Destino', Landmark, { label: 'Sin destino' }),
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

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

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
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...TREASURY_QUERY_KEYS.checks]}
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
