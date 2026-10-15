'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CircleOff, Landmark, Tag, type LucideIcon } from 'lucide-react';
import { formatArgentinaDateTime } from '../../../lib/today';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { MOVEMENT_STATE_UI } from '../../../lib/status-presentation';
import { useCallback, useMemo, useState } from 'react';
import type { TreasuryAccountRow } from '../../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../../actions/concepts.server';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
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

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

const KIND_VALUES = Object.keys(TREASURY_MOVEMENT_KIND_LABELS) as TreasuryMovementListItem['kind'][];
const STATE_VALUES = Object.keys(MOVEMENT_STATE_LABELS) as (keyof typeof MOVEMENT_STATE_LABELS)[];

/** Importe del export: vacio si la columna no aplica (no el guion de la pantalla). */
const exportMoney = (value: unknown) => (value ? formatMoney(String(value)) : '');

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
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getTreasuryMovementsPaginated(params), []);

  const columns = useMemo(() => getColumns({ canUpdate, accounts, concepts }), [canUpdate, accounts, concepts]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const fkFacet =
      (columnId: string, icon: LucideIcon, nullLabel?: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getTreasuryMovementSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
        return {
          options: [
            ...(result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon })),
            ...(nullLabel && result.counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }]
              : []),
          ],
          counts: result.counts,
        };
      };

    return [
      {
        columnId: 'kind',
        title: 'Tipo',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getTreasuryMovementSingleFacet('kind', params);
          if (!result) return EMPTY_FACET;
          return {
            options: KIND_VALUES.map((value) => ({
              value,
              label: TREASURY_MOVEMENT_KIND_LABELS[value],
              icon: movementKindIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'account', title: 'Cuenta', fetchFacet: fkFacet('account', Landmark) },
      { columnId: 'date', title: 'Fecha', type: 'dateRange' as const },
      { columnId: 'concept', title: 'Concepto', fetchFacet: fkFacet('concept', Tag, NO_CONCEPT_LABEL) },
      {
        columnId: 'state',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getTreasuryMovementSingleFacet('state', params);
          if (!result) return EMPTY_FACET;
          return {
            options: STATE_VALUES.map((value) => ({
              value,
              label: MOVEMENT_STATE_LABELS[value],
              icon: MOVEMENT_STATE_UI[value].icon,
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'description', title: 'Descripción', type: 'text' as const, placeholder: 'Buscar en la descripción...' },
      { columnId: 'origin', title: 'Origen', type: 'text' as const, placeholder: 'Número, ej: OP-000012, TR-000003, RE-000001 o CD-000001' },
      { columnId: 'income', title: 'Ingreso', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'expense', title: 'Egreso', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'cancel_reason', title: 'Motivo de anulación', type: 'text' as const, placeholder: 'Buscar en el motivo...' },
    ];
  }, []);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

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
      searchParams={searchParams}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      queryFn={tableQueryFn}
      queryKey={[...TREASURY_QUERY_KEYS.movements]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por descripción, cuenta, concepto u origen"
      emptyMessage="No hay movimientos"
      exportConfig={exportConfig}
      data-testid="treasury-movements-table"
    />
  );
}
