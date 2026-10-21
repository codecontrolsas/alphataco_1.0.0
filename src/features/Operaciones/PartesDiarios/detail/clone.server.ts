'use server';

import { withSessionActor } from '@/features/Operaciones/lib/with-session-actor';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { findCloneConflicts, formatUtcTime, type CloneConflictsByDate } from '../lib/clone-conflicts';
import { resolveCloneRowIds } from './lib/clone-helpers';
import { reconcileRowResourceStatus } from '../lib/row-resource-status';
import { createRowRelations, type EmployeeInput } from './lib/row-relations';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/clone');

// ============================================================================
// 10. CLONE ROWS
// ============================================================================

/**
 * Datos mínimos de una fila para clonar (los campos que se copian).
 * El resto (id, created_at, etc.) se regenera.
 */
interface RowToClone {
  id: string;
  customer_id: string | null;
  service_id: string | null;
  item_id: string | null;
  quantity: Prisma.Decimal;
  working_day: string | null;
  start_time: Date | null;
  end_time: Date | null;
  description: string | null;
  areas_service_id: string | null;
  sector_service_id: string | null;
  type_service: 'mensual' | 'adicional' | 'adicional_permanente' | null;
  /** Empleados a copiar (si trasladarPersonal = true) */
  dailyreportemployeerelations?: Array<{
    employee_id: string | null;
    role: 'chofer_dia' | 'chofer_noche' | 'ayudante_dia' | 'ayudante_noche' | null;
  }>;
  /** Equipos (vehículos + otros) a copiar (si trasladarEquipos = true) */
  dailyreportequipmentrelations?: Array<{
    equipment_id: string | null;
    other_equipment_id: string | null;
  }>;
  /** Equipos de clientes — siempre se copian */
  dailyreport_customer_equipment_relations?: Array<{
    customer_equipment_id: string;
  }>;
}

export interface CloneRowsOptions {
  /** Si true, copia empleados activos de las filas originales */
  includeEmployees?: boolean;
  /** Si true, copia equipos (vehículos + otros) de las filas originales */
  includeEquipment?: boolean;
  /**
   * Si se provee y rowIds está vacío, clona TODAS las filas del parte indicado.
   * Permite el flujo "Clonar todo el parte" sin selección previa.
   */
  cloneAllFromReportId?: string;
  /**
   * Filtro opcional de tipos de servicio a incluir (solo aplica en modo "clonar todo").
   * Si no se provee, se incluyen todos los tipos.
   */
  typeServiceFilter?: Array<'mensual' | 'adicional' | 'adicional_permanente'>;
  /**
   * Map de `targetDate (YYYY-MM-DD) → array de rowIds a omitir en esa fecha`.
   * Permite clonar el resto de las rows en fechas con conflictos parciales.
   * Si una fecha no está en el map, se clonan todas las rows.
   */
  skipRowIdsByDate?: Record<string, string[]>;
}

/**
 * Clona filas seleccionadas a una o más fechas destino.
 *
 * Para cada fecha:
 * 1. Verifica si ya existe un `dailyreport` para esa fecha; si no, lo crea.
 * 2. Crea una copia de cada fila (con relaciones según opciones) dentro del
 *    parte correspondiente, en una transacción por fecha.
 *
 * Lógica de status: si se copian empleados o equipos → 'pendiente',
 * si no → 'sin_recursos_asignados' (misma regla que ClonarRegistrosButton).
 */
export async function cloneDailyReportRows(rowIds: string[], targetDates: string[], options: CloneRowsOptions = {}) {
  logger.debug('Clonando filas del parte diario', {
    data: { rowCount: rowIds.length, dateCount: targetDates.length },
  });

  if (targetDates.length === 0) {
    return { createdReportIds: [], clonedRowCount: 0 };
  }

  const { includeEmployees = false, includeEquipment = false } = options;

  try {
    // Perímetro: se resuelve la empresa activa ANTES de tocar cualquier rowId/reportId que
    // venga del cliente — cloneDailyReportRows es una Server Action invocable directamente,
    // sin pasar por la UI, así que rowIds/cloneAllFromReportId no son de fiar por sí solos.
    const companyId = await getActiveCompanyId();

    // Modo "clonar todo" (rowIds vacío + cloneAllFromReportId) o selección acotada a la empresa activa.
    const resolvedRowIds = await resolveCloneRowIds(
      companyId,
      rowIds,
      options.cloneAllFromReportId,
      options.typeServiceFilter
    );

    if (resolvedRowIds.length === 0) {
      return { createdReportIds: [], clonedRowCount: 0 };
    }

    // 1. Cargar las filas originales con sus relaciones
    const originalRows = await prisma.dailyreportrows.findMany({
      where: { id: { in: resolvedRowIds } },
      select: {
        id: true,
        customer_id: true,
        service_id: true,
        item_id: true,
        quantity: true,
        working_day: true,
        start_time: true,
        end_time: true,
        description: true,
        areas_service_id: true,
        sector_service_id: true,
        type_service: true,
        dailyreportemployeerelations: {
          select: {
            employee_id: true,
            role: true,
            employees: { select: { is_active: true } },
          },
        },
        dailyreportequipmentrelations: {
          select: {
            equipment_id: true,
            other_equipment_id: true,
            other_equipment: { select: { is_active: true } },
          },
        },
        dailyreport_customer_equipment_relations: {
          select: { customer_equipment_id: true },
        },
      },
    });

    if (originalRows.length === 0) {
      throw new Error('No se encontraron las filas a clonar');
    }

    // 2. company_id activo ya resuelto arriba (se reutiliza para crear dailyreport headers)

    // 3. Verificar qué fechas ya tienen un dailyreport
    const existingReports = await prisma.dailyreport.findMany({
      where: {
        date: { in: targetDates.map((d) => moment.utc(d).toDate()) },
        company_id: companyId,
      },
      select: { id: true, date: true },
    });

    const existingByDate = new Map(existingReports.map((r) => [moment.utc(r.date).format('YYYY-MM-DD'), r]));

    const createdReportIds: string[] = [];
    const allReportIds: string[] = [];
    let totalCloned = 0;

    // 4. Para cada fecha destino, crear el header si falta y clonar las filas
    for (const targetDate of targetDates) {
      // Resolver rows efectivas para ESTA fecha (aplica skip si corresponde)
      const skipForDate = options.skipRowIdsByDate?.[targetDate] ?? [];
      const rowsForThisDate = skipForDate.length
        ? originalRows.filter((r) => !skipForDate.includes(r.id))
        : originalRows;

      // Si no quedan rows para clonar en esta fecha, no crear header ni transacción
      if (rowsForThisDate.length === 0) {
        continue;
      }

      // Resolver/crear el dailyreport destino con upsert (race-safe gracias al UNIQUE
      // compound (date, company_id)). El snapshot pre-cargado solo se usa para
      // diferenciar "creado por esta llamada" vs "ya existía".
      const wasInPreSnapshot = existingByDate.has(targetDate);
      const targetDateValue = moment.utc(targetDate).toDate();
      const report = await prisma.dailyreport.upsert({
        where: {
          date_company_id: {
            date: targetDateValue,
            company_id: companyId,
          },
        },
        update: {},
        create: {
          id: crypto.randomUUID(),
          date: targetDateValue,
          company_id: companyId,
        },
        select: { id: true, date: true },
      });

      if (!wasInPreSnapshot) {
        createdReportIds.push(report.id);
      }

      allReportIds.push(report.id);

      const targetReportId = report.id;

      // Clonar todas las filas para esta fecha en una transacción
      await withSessionActor(async (tx) => {
        const newRowIds: string[] = [];
        for (const originalRow of rowsForThisDate) {
          // Determinar empleados a copiar (solo activos)
          const employeesToCopy: EmployeeInput[] = includeEmployees
            ? originalRow.dailyreportemployeerelations
                .filter((rel) => rel.employee_id != null && rel.employees?.is_active !== false)
                .map((rel) => ({
                  id: rel.employee_id!,
                  ...(rel.role ? { role: rel.role } : {}),
                }))
            : [];

          // Determinar equipos a copiar
          const vehiclesToCopy = includeEquipment
            ? originalRow.dailyreportequipmentrelations
                .filter((rel) => rel.equipment_id != null)
                .map((rel) => rel.equipment_id!)
            : [];

          // Otros equipos: solo activos, igual que los empleados — un equipo dado de baja
          // no se vuelve a asignar en las filas clonadas (ticket 697).
          const otherEquipmentToCopy = includeEquipment
            ? originalRow.dailyreportequipmentrelations
                .filter((rel) => rel.other_equipment_id != null && rel.other_equipment?.is_active !== false)
                .map((rel) => rel.other_equipment_id!)
            : [];

          // Equipos de clientes — siempre se copian (comportamiento de ClonarRegistrosButton)
          const customerEquipmentToCopy = originalRow.dailyreport_customer_equipment_relations.map(
            (rel) => rel.customer_equipment_id
          );

          const hasResources =
            employeesToCopy.length > 0 || vehiclesToCopy.length > 0 || otherEquipmentToCopy.length > 0;
          const newStatus: 'pendiente' | 'sin_recursos_asignados' = hasResources
            ? 'pendiente'
            : 'sin_recursos_asignados';

          const newRowId = crypto.randomUUID();

          await tx.dailyreportrows.create({
            data: {
              id: newRowId,
              daily_report_id: targetReportId,
              customer_id: originalRow.customer_id,
              service_id: originalRow.service_id,
              item_id: originalRow.item_id,
              // Se copia tal cual: clonar una línea de 3 unidades y que salga 1 sería una
              // diferencia de importe que nadie vería hasta la certificación.
              quantity: originalRow.quantity,
              working_day: originalRow.working_day,
              start_time: originalRow.start_time,
              end_time: originalRow.end_time,
              description: originalRow.description,
              areas_service_id: originalRow.areas_service_id,
              sector_service_id: originalRow.sector_service_id,
              type_service: originalRow.type_service,
              status: newStatus,
              cloned_from_row_id: originalRow.id,
            },
          });

          await createRowRelations(
            tx,
            newRowId,
            employeesToCopy,
            vehiclesToCopy,
            otherEquipmentToCopy,
            customerEquipmentToCopy
          );

          newRowIds.push(newRowId);
          totalCloned++;
        }
        // Estado definitivo con la fórmula única (flags del ítem), una sola sentencia para todas las líneas.
        await reconcileRowResourceStatus(tx, newRowIds);
      });
    }

    return {
      createdReportIds,
      allReportIds,
      clonedRowCount: totalCloned,
    };
  } catch (error) {
    logger.error('Error al clonar filas del parte diario', { data: { error } });
    throw new Error('No se pudieron clonar las filas del parte diario. Intente nuevamente.');
  }
}

// ============================================================================
// 10a. CLONE CONFLICTS (verificación previa al clonado)
// ============================================================================

/** Re-exportados del módulo puro `lib/clone-conflicts` (ahí viven la forma y la agrupación). */
export type { CloneConflictRow, CloneConflictsByDate } from '../lib/clone-conflicts';

/**
 * Verifica si las rows a clonar ya fueron clonadas previamente a las fechas destino.
 *
 * Para cada `(rowId, targetDate)` busca si existe un `dailyreportrows` cuyo
 * `cloned_from_row_id ∈ effectiveRowIds` dentro del `dailyreport` correspondiente
 * a esa fecha y la `company_id` actual.
 *
 * Si `rowIds` está vacío y hay `cloneAllFromReportId`, primero resuelve las rows
 * efectivas (mismo comportamiento que `cloneDailyReportRows`).
 */
export async function getCloneConflicts(
  rowIds: string[],
  targetDates: string[],
  cloneAllFromReportId?: string,
  typeServiceFilter?: Array<'mensual' | 'adicional' | 'adicional_permanente'>
): Promise<CloneConflictsByDate> {
  logger.debug('Buscando conflictos de clonación', {
    data: { rowCount: rowIds.length, dateCount: targetDates.length, cloneAllFromReportId },
  });

  if (targetDates.length === 0) {
    return { conflicts: {}, totalCount: 0, skipMap: {} };
  }

  try {
    // Perímetro: se resuelve la empresa activa antes de tocar rowIds/cloneAllFromReportId —
    // misma razón que en cloneDailyReportRows (Server Action invocable con cualquier id).
    const companyId = await getActiveCompanyId();

    // 1. Resolver rows efectivas (mismo flujo que el clone)
    const effectiveRowIds = await resolveCloneRowIds(companyId, rowIds, cloneAllFromReportId, typeServiceFilter);

    if (effectiveRowIds.length === 0) {
      return { conflicts: {}, totalCount: 0, skipMap: {} };
    }

    // 3. Resolver dailyreports destino
    const reports = await prisma.dailyreport.findMany({
      where: {
        date: { in: targetDates.map((d) => moment.utc(d).toDate()) },
        company_id: companyId,
      },
      select: { id: true, date: true },
    });

    if (reports.length === 0) {
      return { conflicts: {}, totalCount: 0, skipMap: {} };
    }

    const reportIdToDate = new Map(reports.map((r) => [r.id, moment.utc(r.date).format('YYYY-MM-DD')]));

    // 4. Buscar rows duplicadas en esos partes
    const duplicatedRows = await prisma.dailyreportrows.findMany({
      where: {
        daily_report_id: { in: reports.map((r) => r.id) },
        cloned_from_row_id: { in: effectiveRowIds },
      },
      select: {
        id: true,
        cloned_from_row_id: true,
        daily_report_id: true,
        working_day: true,
        start_time: true,
        end_time: true,
        description: true,
        type_service: true,
        created_at: true,
        customers: { select: { name: true } },
        customer_services: { select: { service_name: true } },
        service_items: { select: { item_name: true } },
        service_sectors: { select: { sectors: { select: { name: true } } } },
        service_areas: { select: { areas_cliente: { select: { descripcion_corta: true } } } },
      },
    });

    // 5. Agrupar por fecha destino con el módulo puro (testeado en lib/clone-conflicts.test.ts)
    const { conflicts, totalCount, skipMap } = findCloneConflicts(
      duplicatedRows.map((dup) => ({
        id: dup.id,
        cloned_from_row_id: dup.cloned_from_row_id,
        daily_report_id: dup.daily_report_id,
        customerName: dup.customers?.name ?? null,
        serviceName: dup.customer_services?.service_name ?? null,
        itemName: dup.service_items?.item_name ?? null,
        sectorName: dup.service_sectors?.sectors?.name ?? null,
        areaName: dup.service_areas?.areas_cliente?.descripcion_corta ?? null,
        workingDay: dup.working_day,
        startTime: formatUtcTime(dup.start_time),
        endTime: formatUtcTime(dup.end_time),
        description: dup.description,
        typeService: dup.type_service,
        clonedAt: dup.created_at?.toISOString() ?? null,
      })),
      reportIdToDate
    );

    return { conflicts, totalCount, skipMap };
  } catch (error) {
    logger.error('Error al verificar conflictos de clonación', { data: { error } });
    throw new Error('No se pudieron verificar los registros existentes. Intentá nuevamente.');
  }
}

// ============================================================================
// 10b. TYPE SERVICE SUMMARY (para CloneRowsDialog)
// ============================================================================

/**
 * Retorna la cantidad de filas por tipo de servicio de un parte diario.
 * Usado por CloneRowsDialog para saber qué checkboxes de tipo habilitar.
 */
export async function getDailyReportTypeServiceSummary(dailyReportId: string) {
  logger.debug('Obteniendo resumen de tipos de servicio', { data: { dailyReportId } });

  try {
    // Perímetro: sólo se resume el parte si pertenece a la empresa activa.
    const companyId = await getActiveCompanyId();

    const rows = await prisma.dailyreportrows.groupBy({
      by: ['type_service'],
      where: { daily_report_id: dailyReportId, dailyreport: { company_id: companyId } },
      _count: true,
    });

    const summary: Record<string, number> = {};
    for (const row of rows) {
      const key = row.type_service ?? 'null';
      summary[key] = row._count;
    }

    return summary;
  } catch (error) {
    logger.error('Error al obtener resumen de tipos de servicio', { data: { error, dailyReportId } });
    return {};
  }
}

