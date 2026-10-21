import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { hasDailyReportPermission } from '@/features/MobileApi/lib/permissions';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext } from '@/shared/lib/tenant-context';
import { z } from 'zod';

type EquipmentRef = { id: string; kind: 'vehicle' | 'other'; label: string };

/** Líneas de un parte diario con lo que la app muestra en la lista: servicio, estado, versión y recursos asignados. */
export const GET = mobileRoute<{ reportId: string }>({
  run: async ({ ctx, params }) => {
    if (!z.string().uuid().safeParse(params.reportId).success) return mobileError(422, 'INVALID_INPUT', 'reportId inválido.');
    if (!(await hasDailyReportPermission(ctx, 'view'))) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver los partes diarios.');

    const rows = await runWithTenantContext(prismaBase, ctx, (tx) =>
      tx.dailyreportrows.findMany({
        where: { daily_report_id: params.reportId, dailyreport: { company_id: ctx.companyId } },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          version: true,
          status: true,
          working_day: true,
          shift_12h: true,
          description: true,
          remit_number: true,
          completed_day: true,
          completed_night: true,
          customers: { select: { name: true } },
          customer_services: { select: { service_name: true } },
          service_items: { select: { item_name: true } },
          dailyreportemployeerelations: { select: { role: true, employees: { select: { id: true, file: true, firstname: true, lastname: true } } } },
          dailyreportequipmentrelations: {
            select: { vehicles: { select: { id: true, domain: true, intern_number: true } }, other_equipment: { select: { id: true, intern_number: true, type: { select: { name: true } } } } },
          },
        },
      })
    );
    return mobileJson({
      reportId: params.reportId,
      rows: rows.map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        workingDay: row.working_day,
        shift: row.shift_12h,
        description: row.description,
        remitNumber: row.remit_number,
        completedDay: row.completed_day,
        completedNight: row.completed_night,
        customer: row.customers?.name ?? null,
        service: row.customer_services?.service_name ?? null,
        item: row.service_items?.item_name ?? null,
        employees: row.dailyreportemployeerelations.flatMap((relation) =>
          relation.employees ? [{ id: relation.employees.id, file: relation.employees.file, name: `${relation.employees.lastname} ${relation.employees.firstname}`, role: relation.role }] : []
        ),
        equipment: row.dailyreportequipmentrelations.flatMap((relation): EquipmentRef[] =>
          relation.vehicles
            ? [{ id: relation.vehicles.id, kind: 'vehicle' as const, label: relation.vehicles.domain ?? relation.vehicles.intern_number ?? relation.vehicles.id }]
            : relation.other_equipment
              ? [{ id: relation.other_equipment.id, kind: 'other' as const, label: relation.other_equipment.intern_number ?? relation.other_equipment.type?.name ?? relation.other_equipment.id }]
              : []
        ),
      })),
    });
  },
});
