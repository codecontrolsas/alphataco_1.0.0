'use server';

import { withSessionActor } from '@/features/Operaciones/lib/with-session-actor';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Operaciones/Certificacion/mutations');

export interface BulkCertifyResult {
  /** Filas que pasaron a `en_certificacion`. */
  certified: number;
  /** Ids recibidos que no eran elegibles (otra empresa, inexistentes o no `ejecutado`). */
  skippedIds: string[];
}

/**
 * Pasa a `en_certificacion` las líneas de parte diario seleccionadas.
 *
 * Sólo son elegibles las filas en estado `ejecutado` de la empresa activa; si ninguna lo es,
 * lanza en vez de informar un éxito vacío (el toast tiene que decir lo que realmente pasó).
 * La escritura va dentro de `withSessionActor`: `dailyreportrows` tiene trigger de historial.
 */
export async function bulkCertifyRows(rowIds: string[]): Promise<BulkCertifyResult> {
  if (!rowIds.length) {
    throw new Error('No hay registros seleccionados.');
  }

  // Misma clave que usa el cliente para mostrar la acción (`comercial:daily_reports:update`).
  if (!(await checkPermissionServer('comercial', 'daily_reports', 'update'))) {
    throw new Error('No tenés permiso para certificar líneas.');
  }

  try {
    const companyId = await getActiveCompanyId();

    const eligible = await prisma.dailyreportrows.findMany({
      where: {
        id: { in: rowIds },
        status: 'ejecutado',
        dailyreport: { company_id: companyId },
      },
      select: { id: true },
    });

    if (eligible.length === 0) {
      throw new Error('Ninguno de los registros seleccionados está en estado "ejecutado".');
    }

    const eligibleIds = eligible.map((row) => row.id);
    const skippedIds = rowIds.filter((id) => !eligibleIds.includes(id));

    await withSessionActor(async (tx) => {
      await tx.dailyreportrows.updateMany({
        where: { id: { in: eligibleIds } },
        data: { status: 'en_certificacion', last_comercial_edit_at: new Date(), updated_at: new Date() },
      });
    });

    return { certified: eligibleIds.length, skippedIds };
  } catch (error) {
    logger.error('Error al certificar las líneas seleccionadas', { data: { error, rowIds } });
    throw error instanceof Error ? error : new Error('Error al certificar los registros seleccionados.');
  }
}
