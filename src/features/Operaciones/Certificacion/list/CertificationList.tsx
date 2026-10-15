import { Logger } from '@/lib/logger';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getCertificationRowsPaginated } from '../actions/queries.server';
import { _CertificationDataTable } from './_CertificationDataTable';
import { CERTIFICATION_PARAM_NAMESPACE, CERTIFICATION_TABLE_ID } from './constants';

const logger = new Logger('features/Operaciones/Certificacion/CertificationList');

interface Props {
  searchParams: DataTableSearchParams;
}

/**
 * Tablero de líneas de partes diarios de Comercial (Server Component).
 * Trae la primera página y las preferencias del usuario; el resto (filtros, orden, página,
 * facetas) lo resuelve el cliente por React Query contra las server actions.
 */
export async function CertificationList({ searchParams }: Props) {
  // Solo los params de esta tabla (quita el prefijo del namespace).
  const tableParams = stripPrefixFromSearchParams(searchParams, CERTIFICATION_PARAM_NAMESPACE);

  try {
    const [{ data, total }, preferences] = await Promise.all([
      getCertificationRowsPaginated(tableParams),
      getTablePreferences(CERTIFICATION_TABLE_ID),
    ]);

    return (
      <_CertificationDataTable
        data={data}
        totalRows={total}
        searchParams={tableParams}
        tableId={CERTIFICATION_TABLE_ID}
        initialColumnVisibility={preferences.columnVisibility ?? {}}
        initialFilterVisibility={preferences.filterVisibility ?? {}}
      />
    );
  } catch (error) {
    logger.error('No se pudo cargar el tablero de certificación', { data: { error } });
    return (
      <StateBlock
        variant="error"
        title="No se pudieron cargar las líneas"
        description="Ocurrió un error al consultar los partes diarios. Recargue la página para reintentar."
      />
    );
  }
}
