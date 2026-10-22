'use server';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

const logger = new Logger('features/Operaciones/PartesDiarios/mutations');

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATES_PER_REQUEST = 62;

/**
 * Crea los partes diarios de las fechas indicadas para la empresa activa.
 * `dailyreport` tiene única `(date, company_id)`: las fechas ya existentes se saltean.
 */
export async function createDailyReport(dates: string[]) {
  if (!dates.length) return [];

  // Las Server Actions se pueden invocar sin pasar por la pantalla: el permiso y el formato se validan acá.
  if (!(await checkPermissionServer('operaciones', 'dailyreportstable', 'create'))) {
    throw new Error('No tenés permiso para crear partes diarios.');
  }
  if (dates.length > MAX_DATES_PER_REQUEST || !dates.every((date) => ISO_DAY_RE.test(date) && moment.utc(date, 'YYYY-MM-DD', true).isValid())) {
    throw new Error('Las fechas del parte diario no son válidas.');
  }

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
    // Antes devolvía [] y la pantalla mostraba "creado correctamente" aunque no se hubiera creado nada.
    logger.error('Error al crear el parte diario', { data: { error, dates } });
    throw new Error('No se pudo crear el parte diario. Intente nuevamente.');
  }
}

/**
 * Elimina un parte diario sólo si está vacío (sin líneas).
 *
 * Perímetro: el parte tiene que ser de la empresa activa.
 */
export async function deleteDailyReport(reportId: string) {
  if (!(await checkPermissionServer('operaciones', 'dailyreportstable', 'delete'))) {
    return { success: false, message: 'No tenés permiso para eliminar partes diarios.' };
  }

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
