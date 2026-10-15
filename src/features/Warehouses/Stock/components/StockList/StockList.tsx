import { Card, CardContent } from '@/components/ui/card';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { STOCK_TABLE_ID } from '../../constants';
import { StockAttentionSection } from '../StockAttentionSection';
import { getStockAttention, getStockPaginated } from './actions.server';
import { _StockDataTable } from './components/_StockDataTable';

interface StockListProps {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

const TABLE_ID = STOCK_TABLE_ID;

const logger = new Logger('features/Warehouses/Stock/StockList');

export async function StockList({ searchParams, permissionsMap }: StockListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // La banda arranca antes de esperar la tabla: su Suspense la resuelve sin frenarla.
  const attention = getStockAttention();

  try {
    // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
    const [{ data, total }, preferences] = await Promise.all([
      getStockPaginated(tableParams),
      getTablePreferences(TABLE_ID),
    ]);

    return (
      <Card>
        <CardContent className="pt-6">
          <_StockDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={TABLE_ID}
            permissionsMap={permissionsMap}
            topSlot={<StockAttentionSection attention={attention} />}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
          />
        </CardContent>
      </Card>
    );
  } catch (error) {
    logger.error('No se pudo armar el listado de stock', { data: { error } });
    return (
      <StateBlock
        variant="error"
        title="No se pudo cargar el stock"
        description="Actualizá la página para intentar de nuevo."
      />
    );
  }
}
