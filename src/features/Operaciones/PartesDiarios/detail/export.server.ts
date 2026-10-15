'use server';

import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import type { ExportResult } from '@/shared/lib/export-result';
import { ExportTooLargeError, fetchDetailExportRows } from './lib/export-batches';
import { buildWhereClause } from './lib/row-query';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/export');

// ============================================================================
// 3. EXPORT QUERY (sin paginación)
// ============================================================================

/**
 * Obtiene todas las filas del parte diario para exportación (hasta EXPORT_MAX_ROWS, en tandas).
 * Respeta los filtros activos pero sin paginación (skip/take).
 *
 * Devuelve un resultado discriminado: Next enmascara en producción el mensaje de un error lanzado desde una
 * server action, así que el motivo (por ejemplo "demasiadas líneas") viaja en `{ ok: false, message }`.
 */
export async function getDailyReportDetailForExport(dailyReportId: string, searchParams: DataTableSearchParams) {
  logger.debug('Exportando filas del parte diario', { data: { dailyReportId } });

  try {
    const state = parseSearchParams(searchParams);
    const companyId = await getActiveCompanyId();
    const where = buildWhereClause(dailyReportId, state, companyId);

    const safeOrderBy = [
      { customers: { name: 'asc' as const } },
      { customer_services: { service_name: 'asc' as const } },
      { service_items: { item_name: 'asc' as const } },
    ];

    // Por tandas y con tope (EXPORT_MAX_ROWS): ver lib/export-batches.ts
    const rows = await fetchDetailExportRows(where, safeOrderBy);

    return { ok: true, data: rows } satisfies ExportResult<typeof rows>;
  } catch (error) {
    logger.error('Error al exportar filas del parte diario', {
      data: { error, dailyReportId },
    });
    const message =
      error instanceof ExportTooLargeError
        ? error.message
        : 'No se pudieron exportar las filas del parte diario. Intente nuevamente.';
    return { ok: false, message } satisfies ExportResult<never>;
  }
}
