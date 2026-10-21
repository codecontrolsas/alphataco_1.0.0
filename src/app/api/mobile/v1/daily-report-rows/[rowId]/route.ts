import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { toReportDateString } from '@/features/Operaciones/PartesDiarios/detail/lib/report-date';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext } from '@/shared/lib/tenant-context';
import { z } from 'zod';

/** Estado, versión (la `baseVersion` de los comandos) y recursos de una línea del parte diario. */
export const GET = mobileRoute<{ rowId: string }>({
  run: async ({ ctx, params }) => {
    if (!z.string().uuid().safeParse(params.rowId).success) return mobileError(422, 'INVALID_INPUT', 'rowId inválido.');
    const row = await runWithTenantContext(prismaBase, ctx, (tx) =>
      tx.dailyreportrows.findFirst({
        where: { id: params.rowId, dailyreport: { company_id: ctx.companyId } },
        select: {
          id: true,
          version: true,
          status: true,
          dailyreport: { select: { date: true } },
          dailyreportemployeerelations: { select: { employee_id: true, role: true } },
          dailyreportequipmentrelations: { select: { equipment_id: true, other_equipment_id: true } },
          dailyreport_customer_equipment_relations: { select: { customer_equipment_id: true } },
        },
      })
    );
    if (!row) return mobileError(404, 'NOT_FOUND', 'La línea no existe o no pertenece a la empresa activa.');
    return mobileJson({
      id: row.id,
      version: row.version,
      status: row.status,
      reportDate: row.dailyreport ? toReportDateString(row.dailyreport.date) : null,
      resources: {
        employees: row.dailyreportemployeerelations.map((relation) => ({ id: relation.employee_id, role: relation.role })),
        equipment: row.dailyreportequipmentrelations.flatMap((relation) => (relation.equipment_id ? [relation.equipment_id] : [])),
        otherEquipment: row.dailyreportequipmentrelations.flatMap((relation) => (relation.other_equipment_id ? [relation.other_equipment_id] : [])),
        customerEquipment: row.dailyreport_customer_equipment_relations.flatMap((relation) =>
          relation.customer_equipment_id ? [relation.customer_equipment_id] : []
        ),
      },
    });
  },
});
