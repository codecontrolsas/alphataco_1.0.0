'use server';

import { withSessionActor } from '@/features/Operaciones/lib/with-session-actor';
import { preparte_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { resolveRowQuantity } from '@/features/Operaciones/PartesDiarios/lib/row-quantity';
import { reconcileRowResourceStatus } from '@/features/Operaciones/PartesDiarios/lib/row-resource-status';
import { argentinaDate, formatDateAr } from '@/shared/lib/argentina-time';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { getStatusActorPayload } from '../lib/preparte-actor';
import { preparteCompanyScope } from '../lib/preparte-scope';
import { assertPreparteActionAllowed } from '../lib/preparte-permissions';
import { BULK_EDITABLE_STATUSES, canTransition } from '../lib/preparte-status';

const logger = new Logger('features/Operaciones/Preparte/bulk');

/**
 * Filas elegibles para una acción masiva: de la empresa activa y en un estado que la
 * máquina de estados habilita (`pendiente` / `reprogramado`).
 */
async function findBulkEligibleIds(ids: string[], companyId: string): Promise<Set<string>> {
  const rows = await prisma.preparte.findMany({
    where: {
      id: { in: ids },
      ...preparteCompanyScope(companyId),
      status: { in: [...BULK_EDITABLE_STATUSES] },
    },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

// ============================================================================
// CAMBIO MASIVO DE ESTADO
// ============================================================================

/**
 * Cambia el estado de varios pedidos a la vez.
 *
 * El actor (`rejected_by` / `cancelled_by` / `reprogrammed_by`) sale de la sesión;
 * `confirmed_by` sigue siendo un texto que escribe el usuario.
 */
export async function updateMultiplePreparteStatus(
  ids: string[],
  updateData: {
    status?: 'pendiente' | 'reprogramado' | 'cancelado' | 'rechazado' | 'vencido' | 'confirmado';
    cancel_reason?: string;
    rejected_reason?: string;
    reprogram_reason?: string;
    confirmed_by?: string;
  }
) {
  await assertPreparteActionAllowed('update');
  const companyId = await getActiveCompanyId();
  const eligibleIds = await findBulkEligibleIds(ids, companyId);

  if (ids.some((id) => !eligibleIds.has(id))) {
    throw new Error('Solo se pueden modificar masivamente pedidos pendientes o reprogramados.');
  }

  const actorPayload = await getStatusActorPayload(updateData.status);

  try {
    const result = await prisma.preparte.updateMany({
      where: { id: { in: ids }, ...preparteCompanyScope(companyId) },
      data: {
        ...(updateData.status ? { status: updateData.status as preparte_status } : {}),
        ...(updateData.cancel_reason !== undefined ? { cancel_reason: updateData.cancel_reason } : {}),
        ...(updateData.rejected_reason !== undefined ? { rejected_reason: updateData.rejected_reason } : {}),
        ...(updateData.reprogram_reason !== undefined ? { reprogram_reason: updateData.reprogram_reason } : {}),
        ...(updateData.confirmed_by !== undefined ? { confirmed_by: updateData.confirmed_by } : {}),
        ...actorPayload,
        // Pedido viejo sin empresa: al tocarlo lo adopta la empresa activa.
        company_id: companyId,
        updated_at: new Date(),
      },
    });

    return { updated: result.count };
  } catch (error) {
    logger.error('Error al actualizar el estado de varios pedidos', { data: { error, ids } });
    throw error;
  }
}

// ============================================================================
// CONFIRMACIÓN → PARTE DIARIO
// ============================================================================

export interface ConfirmPreparteResult {
  success: true;
  dailyReportRowId: string;
  alreadyExisted: boolean;
}

/**
 * Confirma un pedido y lo migra al parte diario de su fecha de ejecución.
 * Fuente única de verdad de la confirmación (individual y masiva).
 *
 * Perímetro: el pedido tiene que ser de la empresa activa; el parte diario se busca/crea
 * siempre con `company_id` de la empresa activa. La escritura de `dailyreportrows` va
 * dentro de `withSessionActor` porque la tabla tiene trigger de historial.
 */
async function confirmSinglePreparte(
  preparteId: string,
  companyId: string,
  overrideExecutionDate?: string,
  confirmedBy?: string,
  dailyReportCache?: Map<string, string>
): Promise<ConfirmPreparteResult> {
  const preparte = await prisma.preparte.findFirst({
    where: { id: preparteId, ...preparteCompanyScope(companyId) },
    include: { dailyreportrows: { select: { id: true } } },
  });

  if (!preparte) {
    throw new Error('El pedido no existe o no pertenece a la empresa activa.');
  }

  // Estado confirmable (pendiente, reprogramado o vencido): no se confirma uno ya cerrado.
  // Un pedido ya migrado al parte diario queda afuera de esta regla (sólo se actualiza `confirmed_by`).
  if (!preparte.dailyreportrows && (!preparte.status || !canTransition(preparte.status, preparte_status.confirmado))) {
    throw new Error(
      `${preparte.numero_pedido || preparteId}: el pedido está ${preparte.status ?? 'sin estado'} y no puede confirmarse.`
    );
  }

  // Ya migrado: sólo actualizar quién confirmó.
  if (preparte.dailyreportrows) {
    if (confirmedBy) {
      await prisma.preparte.update({
        where: { id: preparteId },
        data: { confirmed_by: confirmedBy, company_id: companyId, updated_at: new Date() },
      });
    }
    return { success: true, dailyReportRowId: preparte.dailyreportrows.id, alreadyExisted: true };
  }

  const rawDate = overrideExecutionDate ?? preparte.executionDate;
  const parsedDate = rawDate ? moment.utc(rawDate) : null;

  if (preparte.subject_to_availability && !parsedDate?.isValid()) {
    throw new Error(`${preparte.numero_pedido || preparteId}: sujeto a disponibilidad sin fecha asignada`);
  }
  if (!parsedDate || !parsedDate.isValid()) {
    throw new Error(`${preparte.numero_pedido || preparteId}: sin fecha de ejecución válida`);
  }

  const executionDate = parsedDate.format('YYYY-MM-DD');
  let dailyReportId = dailyReportCache?.get(executionDate);

  if (!dailyReportId) {
    const report = await prisma.dailyreport.upsert({
      where: { date_company_id: { date: new Date(`${executionDate}T00:00:00.000Z`), company_id: companyId } },
      create: { date: new Date(`${executionDate}T00:00:00.000Z`), company_id: companyId },
      update: {},
      select: { id: true },
    });
    dailyReportId = report.id;
    dailyReportCache?.set(executionDate, dailyReportId);
  }

  const reportId = dailyReportId;
  const equipmentId = preparte.equipos_cliente;

  const createdRowId = await withSessionActor(async (tx) => {
    const row = await tx.dailyreportrows.create({
      data: {
        daily_report_id: reportId,
        customer_id: preparte.cliente_id,
        service_id: preparte.contrato_id,
        item_id: preparte.item,
        // La cantidad del pedido se perdía en la conversión: `dailyreportrows` no tenía la
        // columna. Sin esto no hay importe posible aunque el precio exista.
        quantity: resolveRowQuantity(preparte.quantity),
        start_time: preparte.start_time ? new Date(`1970-01-01T${preparte.start_time}Z`) : null,
        end_time: preparte.end_time ? new Date(`1970-01-01T${preparte.end_time}Z`) : null,
        working_day: preparte.jornada,
        description: preparte.observaciones || '',
        sector_service_id: preparte.sector_service_id,
        areas_service_id: preparte.areas_service_id,
        type_service: preparte.tipo as 'mensual' | 'adicional' | 'adicional_permanente',
        status: 'sin_recursos_asignados',
        preparte_id: preparteId,
      },
      select: { id: true },
    });

    if (equipmentId) {
      await tx.dailyreport_customer_equipment_relations.create({
        data: { daily_report_row_id: row.id, customer_equipment_id: equipmentId },
      });
    }

    // Un ítem que no exige personal ni equipo no necesita esperar recursos.
    await reconcileRowResourceStatus(tx, [row.id]);

    await tx.preparte.update({
      where: { id: preparteId },
      data: {
        status: preparte.status === preparte_status.vencido ? preparte_status.vencido : preparte_status.confirmado,
        ...(confirmedBy ? { confirmed_by: confirmedBy } : {}),
        company_id: companyId,
        updated_at: new Date(),
      },
    });

    return row.id;
  });

  return { success: true, dailyReportRowId: createdRowId, alreadyExisted: false };
}

/**
 * Confirma un pedido individual y lo migra al parte diario.
 * `overrideExecutionDate` sirve para el flujo de vencidos con fecha nueva.
 */
export async function confirmPreparteToDailyReport(
  preparteId: string,
  overrideExecutionDate?: string,
  confirmedBy?: string
): Promise<ConfirmPreparteResult> {
  await assertPreparteActionAllowed('update');
  const companyId = await getActiveCompanyId();
  return confirmSinglePreparte(preparteId, companyId, overrideExecutionDate, confirmedBy);
}

/**
 * Confirma varios pedidos y los migra al parte diario, reutilizando el parte por fecha.
 * Los pedidos que no están en un estado elegible se informan como error, sin cortar el lote.
 */
export async function confirmMultiplePrepartesToDailyReport(preparteIds: string[], confirmedBy: string) {
  await assertPreparteActionAllowed('update');
  const companyId = await getActiveCompanyId();
  const eligibleIds = await findBulkEligibleIds(preparteIds, companyId);

  const dailyReportCache = new Map<string, string>();
  const errors: string[] = [];
  let succeeded = 0;
  let skipped = 0;

  for (const id of preparteIds) {
    if (!eligibleIds.has(id)) {
      errors.push(`${id}: solo se pueden confirmar masivamente pedidos pendientes o reprogramados`);
      continue;
    }
    try {
      const result = await confirmSinglePreparte(id, companyId, undefined, confirmedBy, dailyReportCache);
      if (result.alreadyExisted) skipped++;
      else succeeded++;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Error desconocido');
      logger.error('Error al confirmar un pedido del lote', { data: { preparteId: id, error } });
    }
  }

  return { succeeded, skipped, errors };
}

// ============================================================================
// REPROGRAMACIÓN MASIVA (COD-395)
// ============================================================================

/**
 * Reprogramación masiva atómica. Por cada pedido:
 *  1. crea un clon `pendiente` con la fecha nueva y `reprogram` apuntando al original;
 *  2. marca el original como `reprogramado` con el motivo y la nota en observaciones.
 *
 * Todo dentro de una única transacción: si algo falla, no se reprograma nada.
 */
export async function bulkReschedulePrepartes(ids: string[], newDate: Date, reason: string) {
  logger.debug('Reprogramación masiva de pedidos', { data: { count: ids.length, newDate, reason } });

  if (!ids.length) {
    throw new Error('No se seleccionaron pedidos para reprogramar.');
  }
  if (!(newDate instanceof Date) || Number.isNaN(newDate.getTime())) {
    throw new Error('La fecha de reprogramación no es válida.');
  }
  if (!reason?.trim()) {
    throw new Error('El motivo de reprogramación es obligatorio.');
  }

  await assertPreparteActionAllowed('update');
  const profile = await getServerAuthProfile();
  const companyId = await getActiveCompanyId();
  const reprogrammedBy = profile?.credentialId ?? null;

  try {
    const originals = await prisma.preparte.findMany({
      where: {
        id: { in: ids },
        ...preparteCompanyScope(companyId),
        status: { in: [...BULK_EDITABLE_STATUSES] },
      },
    });

    const foundIds = new Set(originals.map((row) => row.id));
    const missingIds = ids.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(`${missingIds.length} pedido(s) no existen o ya no están pendientes/reprogramados.`);
    }

    // Fechas de negocio: hoy en hora argentina; `newDate` es medianoche UTC de un día (`@db.Date`).
    const fechaHoy = formatDateAr(argentinaDate());
    const fechaNueva = moment.utc(newDate).format('DD/MM/YYYY');

    const operations = originals.flatMap((original) => [
      prisma.preparte.create({
        data: {
          cliente_id: original.cliente_id,
          contrato_id: original.contrato_id,
          tipo: original.tipo,
          jornada: original.jornada,
          start_time: original.start_time,
          end_time: original.end_time,
          solicitante: original.solicitante,
          item: original.item,
          observaciones: original.observaciones,
          executionDate: newDate,
          requestDate: original.requestDate,
          quantity: original.quantity,
          numero_pedido: original.numero_pedido,
          sector_service_id: original.sector_service_id,
          areas_service_id: original.areas_service_id,
          equipos_cliente: original.equipos_cliente,
          company_id: original.company_id ?? companyId,
          preparteImage: original.preparteImage,
          subject_to_availability: false,
          status: preparte_status.pendiente,
          reprogram: original.id,
        },
      }),
      prisma.preparte.update({
        where: { id: original.id },
        data: {
          status: preparte_status.reprogramado,
          reprogram_reason: reason,
          reprogrammed_by: reprogrammedBy,
          company_id: original.company_id ?? companyId,
          observaciones: `[${fechaHoy}] Se reprogramó para ${fechaNueva}. ${original.observaciones ?? ''}`.trim(),
          updated_at: new Date(),
        },
      }),
    ]);

    await prisma.$transaction(operations);

    return { succeeded: originals.length, errors: [] as string[] };
  } catch (error) {
    logger.error('Error en la reprogramación masiva de pedidos', { data: { error, ids, newDate, reason } });
    throw error instanceof Error ? error : new Error('Error al reprogramar los pedidos seleccionados.');
  }
}

export type BulkRescheduleResult = Awaited<ReturnType<typeof bulkReschedulePrepartes>>;
