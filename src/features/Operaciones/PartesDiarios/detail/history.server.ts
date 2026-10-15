'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/history');

// ============================================================================
// 5. HISTORY QUERY
// ============================================================================

/**
 * Obtiene el historial de cambios de una fila del parte diario.
 * Ordenado por created_at descendente (más reciente primero).
 */
export async function getDailyReportRowHistory(rowId: string) {
  logger.debug('Obteniendo historial de fila del parte diario', { data: { rowId } });

  try {
    // Perímetro: la fila tiene que colgar de un parte de la empresa activa.
    const companyId = await getActiveCompanyId();

    const data = await prisma.dailyreportrows_history.findMany({
      where: { daily_report_row_id: rowId, dailyreportrows: { dailyreport: { company_id: companyId } } },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        daily_report_row_id: true,
        related_table: true,
        related_id: true,
        action_type: true,
        changed_data: true,
        changed_fields: true,
        changed_by: true,
        created_at: true,
        metadata: true,
        reassignment_reason: true,
        profile: {
          select: {
            credential_id: true,
            email: true,
            fullname: true,
          },
        },
      },
    });

    return data;
  } catch (error) {
    logger.error('Error al obtener historial de fila del parte diario', {
      data: { error, rowId },
    });
    throw new Error('No se pudo obtener el historial de la fila. Intente nuevamente.');
  }
}

export type DailyReportHistoryEntry = Awaited<ReturnType<typeof getDailyReportRowHistory>>[number];

