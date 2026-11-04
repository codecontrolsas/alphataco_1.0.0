import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import {
  loadChangeHistory,
  roleOf,
  serviceTypeOf,
  shiftOf,
  timeOf,
  workdayTypeOf,
} from '@/features/MobileApi/daily-reports/rows.server';
import { hasDailyReportPermission } from '@/features/MobileApi/lib/permissions';
import { toReportDateString } from '@/features/Operaciones/PartesDiarios/detail/lib/report-date';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext } from '@/shared/lib/tenant-context';
import { z } from 'zod';

type EquipmentRef = { id: string; kind: 'vehicle' | 'other'; label: string };

/** Líneas de un parte diario con lo que la app muestra en la lista: servicio, estado, versión y recursos asignados. */
export const GET = mobileRoute<{ reportId: string }>({
  module: 'operaciones',
  run: async ({ ctx, params }) => {
    if (!z.string().uuid().safeParse(params.reportId).success)
      return mobileError(422, 'INVALID_INPUT', 'reportId inválido.');
    if (!(await hasDailyReportPermission(ctx, 'view')))
      return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver los partes diarios.');

    const { rows, history } = await runWithTenantContext(prismaBase, ctx, async (tx) => {
      const rows = await tx.dailyreportrows.findMany({
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
          start_time: true,
          end_time: true,
          type_service: true,
          cancel_reason: true,
          quantity: true,
          customers: { select: { name: true } },
          customer_services: { select: { service_name: true } },
          service_items: { select: { item_name: true } },
          service_sectors: { select: { sectors: { select: { name: true } } } },
          service_areas: { select: { areas_cliente: { select: { descripcion_corta: true } } } },
          preparte: { select: { id: true, numero_pedido: true, status: true } },
          cloned_from_row: { select: { id: true, dailyreport: { select: { date: true } } } },
          dailyreport_customer_equipment_relations: {
            select: { equipos_clientes: { select: { id: true, name: true } } },
          },
          dailyreportemployeerelations: {
            select: { role: true, employees: { select: { id: true, file: true, firstname: true, lastname: true } } },
          },
          dailyreportequipmentrelations: {
            select: {
              vehicles: { select: { id: true, domain: true, intern_number: true } },
              other_equipment: { select: { id: true, intern_number: true, type: { select: { name: true } } } },
            },
          },
        },
      });
      // Historial de cambios de toda la página en dos consultas (sin N+1).
      return { rows, history: await loadChangeHistory(tx, rows.map((row) => row.id)) };
    });
    return mobileJson({
      reportId: params.reportId,
      rows: rows.map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        workingDay: row.working_day,
        // Revisión 2: jornada normalizada; el horario solo existe en «por horario» y el turno solo en 12 h.
        workdayType: workdayTypeOf(row.working_day),
        startTime: workdayTypeOf(row.working_day) === 'por_horario' ? timeOf(row.start_time) : null,
        endTime: workdayTypeOf(row.working_day) === 'por_horario' ? timeOf(row.end_time) : null,
        shift: shiftOf(
          workdayTypeOf(row.working_day),
          row.shift_12h,
          row.dailyreportemployeerelations.map((relation) => relation.role)
        ),
        sector: row.service_sectors?.sectors?.name ?? null,
        area: row.service_areas?.areas_cliente?.descripcion_corta ?? null,
        serviceType: serviceTypeOf(row.type_service),
        serviceItem: row.service_items?.item_name ?? null,
        quantity: Number(row.quantity),
        cancelReason: row.cancel_reason,
        linkedOrder: row.preparte
          ? { id: row.preparte.id, number: row.preparte.numero_pedido, status: row.preparte.status }
          : null,
        changeHistory: history.get(row.id)
          ? {
              count: history.get(row.id)!.count,
              lastAt: history.get(row.id)!.lastAt,
              lastBy: history.get(row.id)!.lastBy,
            }
          : { count: 0, lastAt: null, lastBy: null },
        copiedFrom: row.cloned_from_row
          ? {
              rowId: row.cloned_from_row.id,
              reportDate: row.cloned_from_row.dailyreport
                ? toReportDateString(row.cloned_from_row.dailyreport.date)
                : null,
            }
          : null,
        clientEquipment: row.dailyreport_customer_equipment_relations.flatMap((relation) =>
          relation.equipos_clientes ? [{ id: relation.equipos_clientes.id, name: relation.equipos_clientes.name }] : []
        ),
        description: row.description,
        remitNumber: row.remit_number,
        completedDay: row.completed_day,
        completedNight: row.completed_night,
        customer: row.customers?.name ?? null,
        service: row.customer_services?.service_name ?? null,
        item: row.service_items?.item_name ?? null,
        employees: row.dailyreportemployeerelations.flatMap((relation) =>
          relation.employees
            ? [
                {
                  id: relation.employees.id,
                  file: relation.employees.file,
                  name: `${relation.employees.lastname} ${relation.employees.firstname}`,
                  role: relation.role,
                  // Revisión 2: chofer / ayudante y turno (solo en jornadas de 12 y 24 h).
                  roleKind: roleOf(relation.role, workdayTypeOf(row.working_day))?.kind ?? null,
                  roleShift: roleOf(relation.role, workdayTypeOf(row.working_day))?.shift ?? null,
                },
              ]
            : []
        ),
        equipment: row.dailyreportequipmentrelations.flatMap((relation): EquipmentRef[] =>
          relation.vehicles
            ? [
                {
                  id: relation.vehicles.id,
                  kind: 'vehicle' as const,
                  label: relation.vehicles.domain ?? relation.vehicles.intern_number ?? relation.vehicles.id,
                },
              ]
            : relation.other_equipment
              ? [
                  {
                    id: relation.other_equipment.id,
                    kind: 'other' as const,
                    label:
                      relation.other_equipment.intern_number ??
                      relation.other_equipment.type?.name ??
                      relation.other_equipment.id,
                  },
                ]
              : []
        ),
      })),
    });
  },
});
