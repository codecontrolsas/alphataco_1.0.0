import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getMeasureUnitsPaginated } from '../../actions/measure-units.server';
import _MensureUnitsDataTable from './_MensureUnitsDataTable';
import { MEASURE_UNITS_TABLE_ID } from './columns';

interface MensureUnitsListProps {
  searchParams: DataTableSearchParams;
  /** Mapa plano "modulo:tab:accion" → boolean, resuelto en el servidor. */
  permissions: Record<string, boolean>;
}

/** Comercial › Unidades de medida. Facets lazy: no se cargan en SSR. */
export default async function MensureUnitsList({ searchParams, permissions }: MensureUnitsListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, MEASURE_UNITS_TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getMeasureUnitsPaginated(tableParams),
    getTablePreferences(MEASURE_UNITS_TABLE_ID),
  ]);

  return (
    <_MensureUnitsDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={MEASURE_UNITS_TABLE_ID}
      permissionsMap={permissions}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
