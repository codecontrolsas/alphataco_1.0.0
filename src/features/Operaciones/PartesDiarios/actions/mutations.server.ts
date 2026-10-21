'use server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

const logger = new Logger('features/Operaciones/PartesDiarios/mutations');

/**
 * Crea los partes diarios de las fechas indicadas para la empresa activa.
 * `dailyreport` tiene única `(date, company_id)`: las fechas ya existentes se saltean.
 */
export async function createDailyReport(dates: string[]) {
  if (!dates.length) return [];

  try {
    const companyId = await getActiveCompanyId();

    const created = await prisma.dailyreport.createManyAndReturn({
      data: dates.map((date) => ({
        date: moment.utc(date, 'YYYY-MM-DD').toDate(),
        company_id: companyId,
      })),
      skipDuplicates: true,
      select: { id: true, date: true, status: true, company_id: true },
    });

    return created.map((report) => ({ ...report, date: moment.utc(report.date).format('YYYY-MM-DD') }));
  } catch (error) {
    logger.error('Error al crear el parte diario', { data: { error, dates } });
    return [];
  }
}

/**
 * Elimina un parte diario sólo si está vacío (sin líneas).
 *
 * Perímetro: el parte tiene que ser de la empresa activa.
 */
export async function deleteDailyReport(reportId: string) {
  try {
    const companyId = await getActiveCompanyId();

    const report = await prisma.dailyreport.findFirst({
      where: { id: reportId, company_id: companyId },
      select: { id: true, _count: { select: { dailyreportrows: true } } },
    });

    if (!report) {
      return { success: false, message: 'El parte diario no existe o no pertenece a la empresa activa' };
    }

    if (report._count.dailyreportrows > 0) {
      return { success: false, message: 'No se puede eliminar un parte diario que contiene registros' };
    }

    await prisma.dailyreport.delete({ where: { id: reportId } });

    return { success: true, message: 'Parte diario eliminado correctamente' };
  } catch (error) {
    logger.error('Error al eliminar el parte diario', { data: { error, reportId } });
    return { success: false, message: 'Error inesperado al procesar la solicitud' };
  }
}
