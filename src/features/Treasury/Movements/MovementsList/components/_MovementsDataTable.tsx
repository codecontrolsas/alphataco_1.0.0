'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Landmark, Tag } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import type { TreasuryAccountRow } from '../../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../../actions/concepts.server';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { MOVEMENT_STATE_UI } from '../../../lib/status-presentation';
import { TREASURY_MOVEMENT_KIND_LABELS } from '../../../schemas/movements';
import {
  getAllTreasuryMovementsForExport,
  getTreasuryMovementSingleFacet,
  getTreasuryMovementsPaginated,
  type TreasuryMovementListItem,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  NO_CONCEPT_LABEL,
  formatValueDate,
  getColumns,
  movementKindIcons,
} from '../columns';
import { MOVEMENT_STATE_LABELS } from '../constants';

interface Props {
  data: TreasuryMovementListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  canUpdate: boolean;
  accounts: TreasuryAccountRow[];
  concepts: TreasuryConceptRow[];
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['date', 'account', 'kind'];

const KIND_VALUES = Object.keys(TREASURY_MOVEMENT_KIND_LABELS) as TreasuryMovementListItem['kind'][];
const STATE_VALUES = Object.keys(MOVEMENT_STATE_LABELS) as (keyof typeof MOVEMENT_STATE_LABELS)[];

/** Importe del export: vacio si la columna no aplica (no el guion de la pantalla). */
const exportMoney = (value: unknown) => (value ? formatMoney(String(value)) : '');

const facets = createFacetFilters(getTreasuryMovementSingleFacet);

export function _MovementsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canUpdate,
  accounts,
  concepts,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getTreasuryMovementsPaginated(params), []);

  const columns = useMemo(() => getColumns({ canUpdate, accounts, concepts }), [canUpdate, accounts, concepts]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    return [
      facets.fixed(
        'kind',
        'Tipo',
        KIND_VALUES.map((value) => ({
          value,
          label: TREASURY_MOVEMENT_KIND_LABELS[value],
          icon: movementKindIcons[value],
        }))
      ),
      facets.lookup('account', 'Cuenta', Landmark),
      { columnId: 'date', title: 'Fecha', type: 'dateRange' as const },
      facets.lookup('concept', 'Concepto', Tag, { label: NO_CONCEPT_LABEL }),
      facets.fixed(
        'state',
        'Estado',
        STATE_VALUES.map((value) => ({
          value,
          label: MOVEMENT_STATE_LABELS[value],
          icon: MOVEMENT_STATE_UI[value].icon,
        }))
      ),
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Buscar en la descripción...',
      },
      {
        columnId: 'origin',
        title: 'Origen',
        type: 'text' as const,
        placeholder: 'Número, ej: OP-000012, TR-000003, RE-000001 o CD-000001',
      },
      { columnId: 'income', title: 'Ingreso', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'expense', title: 'Egreso', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      {
        columnId: 'cancel_reason',
        title: 'Motivo de anulación',
        type: 'text' as const,
        placeholder: 'Buscar en el motivo...',
      },
    ];
  }, []);

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const exportConfig: DataTableExportConfig<TreasuryMovementListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllTreasuryMovementsForExport(currentParams)),
      options: { filename: 'movimientos-tesoreria', title: 'Movimientos', sheetName: 'Movimientos' },
      formatters: {
        date: (value) => formatValueDate(value as string),
        created_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
        income: exportMoney,
        expense: exportMoney,
      },
    }),
    [currentParams]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...TREASURY_QUERY_KEYS.movements]}
      searchPlaceholder="Buscar por descripción, cuenta, concepto u origen"
      emptyMessage="No hay movimientos"
      exportConfig={exportConfig}
      data-testid="treasury-movements-table"
    />
  );
}
