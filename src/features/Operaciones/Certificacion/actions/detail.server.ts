'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Operaciones/Certificacion/detail');

/**
 * Datos personales de los empleados y datos completos de los equipos de UNA línea, para el modal de detalle.
 *
 * Se piden bajo demanda (al abrir el modal) en vez de viajar en cada fila de la tabla: DNI, mail y teléfono
 * no tienen por qué estar en el payload de toda la página. Exige permiso de vista del tablero y acota por la
 * empresa activa (con Prisma no hay RLS).
 */
export async function getCertificationRowPersonalDetail(rowId: string) {
  if (!(await checkPermissionServer('comercial', 'daily_reports', 'view'))) {
    throw new Error('No tenés permiso para ver el detalle de la línea.');
  }

  try {
    const companyId = await getActiveCompanyId();

    const row = await prisma.dailyreportrows.findFirst({
      where: { id: rowId, dailyreport: { company_id: companyId } },
      select: {
        dailyreportemployeerelations: {
          select: {
            employees: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                document_number: true,
                email: true,
                phone: true,
                company_positions: { select: { name: true } },
              },
            },
          },
        },
        dailyreportequipmentrelations: {
          select: {
            vehicles: {
              select: {
                id: true,
                intern_number: true,
                domain: true,
                year: true,
                // `type` es la FK uuid; la relación al catálogo se llama `type_vehicles_typeTotype`.
                type_vehicles_typeTotype: { select: { name: true } },
                brand_vehicles: { select: { name: true } },
                model_vehicles: { select: { name: true } },
                sub_type: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    return {
      employees: (row?.dailyreportemployeerelations ?? []).flatMap((rel) => (rel.employees ? [rel.employees] : [])),
      equipment: (row?.dailyreportequipmentrelations ?? []).flatMap((rel) => (rel.vehicles ? [rel.vehicles] : [])),
    };
  } catch (error) {
    logger.error('Error al obtener el detalle personal de la línea', { data: { error, rowId } });
    throw new Error('No se pudo obtener el detalle de la línea. Intente nuevamente.');
  }
}
