'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { callScalar } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  EMPTY_DEVIATIONS_SUMMARY,
  deviationsLiteResultSchema,
  type DailyReportDeviationsLite,
} from '../schemas/deviations';

const logger = new Logger('features/Operaciones/PartesDiarios/validation');

// Contrato único (schema zod + tipos) en `../schemas/deviations`. Se re-exportan los tipos para
// no romper a los importadores existentes (un archivo 'use server' no puede exportar valores).
export type {
  CustomerEquipmentInfo,
  DailyReportDeviationsLite,
  DailyReportDeviationsResult,
  DeviationsSummary,
  EmployeeDeviation,
  EquipmentDeviation,
  RowWithDeviations,
} from '../schemas/deviations';

// ============================================================================
// ACTION
// ============================================================================

/**
 * Desvíos de empleados y equipos de un parte diario, agrupados por línea y con los datos
 * ya enriquecidos (nombre, CUIL, dominio, condición). Devuelve la variante liviana de la función SQL
 * (`p_include_context = false`): solo `row_id` + desvíos + resumen, que es lo que consume la UI del
 * detalle; los nombres de catálogos y equipos del cliente son del mail nocturno (función completa).
 *
 * Perímetro: el parte tiene que ser de la empresa activa; si no, se devuelve vacío.
 */
export async function getDailyReportDeviations(
  dailyReportId: string,
  reportDate: string
): Promise<DailyReportDeviationsLite> {
  try {
    const companyId = await getActiveCompanyId();

    const report = await prisma.dailyreport.findFirst({
      where: { id: dailyReportId, company_id: companyId },
      select: { id: true },
    });

    if (!report) {
      logger.warn('Parte diario inexistente o de otra empresa', { data: { dailyReportId } });
      return { rows_with_deviations: [], summary: EMPTY_DEVIATIONS_SUMMARY };
    }

    const result = await callScalar(
      'get_daily_report_deviations',
      [{ uuid: dailyReportId }, { date: reportDate }, false],
      deviationsLiteResultSchema
    );

    return {
      rows_with_deviations: result.rows_with_deviations,
      summary: result.summary,
    };
  } catch (error) {
    logger.error('Error al obtener los desvíos del parte diario', { data: { error, dailyReportId } });
    throw error;
  }
}
