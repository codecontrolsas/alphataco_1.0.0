'use server';

import { NUEVO_PEDIDO_CREATE, requireResourceAccess } from '@/features/Mantenimiento/shared/resource-access.server';
import { getResourceCompanyId, type PrismaLike } from '@/features/Mantenimiento/shared/resource-company';
import { assertSupervisorInCompany } from '@/features/Mantenimiento/shared/supervisor-perimeter';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';

const serverLogger = new Logger('SolicitudesMantenimiento/mutations');

/** Estados en los que una solicitud todavía admite que se le agreguen desvíos */
const OPEN_REQUEST_STATUSES = ['pending_approval', 'rejected'] as const;

/**
 * Crea o actualiza solicitudes de mantenimiento desde desvíos.
 *
 * Reglas:
 * - Los desvíos que YA pertenecen a una solicitud solo reciben actualización de comentarios.
 * - Los desvíos SIN solicitud se agrupan por su checklist de origen Y por el equipo al que
 *   pertenecen: cada checklist genera (o reutiliza) su propia solicitud, porque
 *   `maintenance_requests.checklist_answer_id` admite un único checklist por solicitud.
 * - La solicitud se crea sobre el `equipment_id` DEL DESVÍO, no sobre el `input.equipmentId`
 *   (ticket 677). Un checklist de unidad tractora con enganche produce desvíos de las dos
 *   unidades; imputarlos todos a la tractora cargaba al camión el gasto del acoplado.
 * - Solo se reutiliza una solicitud existente si sigue abierta (pending_approval / rejected).
 *   Una solicitud ya aprobada NUNCA se modifica: se crea una nueva.
 *
 * Usado desde el modal de desvíos críticos y desde la tabla de "Equipos con Desvíos"
 */
export async function createOrUpdateMaintenanceRequest(input: {
  equipmentId: string;
  supervisorId: string;
  deviations: Array<{
    deviationId: string;
    comment?: string;
  }>;
  /** Requerido si se va a crear una nueva solicitud */
  checklistAnswerId?: string;
  employeeId?: string;
  userId?: string;
  kilometer?: string;
  driverEmployeeId?: string;
  /** Ítems manuales (texto libre, no del template) */
  manualItems?: Array<{ label: string }>;
}): Promise<
  | {
      ok: true;
      requestId?: string;
      created: boolean;
      /** Cantidad de solicitudes nuevas creadas */
      createdCount: number;
      /** Cantidad de solicitudes abiertas a las que se les sumaron desvíos */
      updatedCount: number;
      /** Cantidad de desvíos que quedaron asociados a una solicitud en esta operación */
      itemsAdded: number;
      /** Desvíos que ya pertenecían a una solicitud previa (solo se actualizó su comentario) */
      alreadyLinkedCount: number;
    }
  | { ok: false; error: string }
> {
  serverLogger.info('createOrUpdateMaintenanceRequest - Iniciando', {
    data: {
      equipmentId: input.equipmentId,
      supervisorId: input.supervisorId,
      deviationsCount: input.deviations.length,
      hasChecklistAnswerId: !!input.checklistAnswerId,
    },
  });

  if (input.manualItems && input.manualItems.length > 0) {
    serverLogger.debug('Se incluyeron ítems manuales', {
      data: { count: input.manualItems.length },
    });
  }

  try {
    const profile = await requireServerAuthProfile();
    // Cada solicitud hereda la empresa de SU unidad: la del contexto o la del enganche
    // (ticket 677). Se cachea por unidad para no repetir la consulta por cada grupo.
    const companyIdByEquipment = new Map<string, string>();
    const resolveCompanyId = async (client: PrismaLike, equipmentId: string) => {
      const cached = companyIdByEquipment.get(equipmentId);
      if (cached) return cached;
      const resolved = await getResourceCompanyId(client, 'vehicle', equipmentId);
      companyIdByEquipment.set(equipmentId, resolved);
      return resolved;
    };
    // Perímetro de dos caminos (operario del QR de la empresa del equipo, o dashboard con
    // `nuevo_pedido:create` en la empresa activa). Corre también desde el QR.
    const { companyId } = await requireResourceAccess('vehicle', input.equipmentId, {
      dashboardPermissions: [NUEVO_PEDIDO_CREATE],
      modules: ['mantenimiento'],
    });
    companyIdByEquipment.set(input.equipmentId, companyId);
    // El supervisor elegido llega del cliente: tiene que ser un usuario de la empresa del equipo.
    await assertSupervisorInCompany(input.supervisorId, companyId);
    const deviationIds = input.deviations.map((d) => d.deviationId);

    // Comentarios del chofer indexados por desvío
    const commentByDeviationId = new Map(
      input.deviations
        .filter((d) => d.comment && d.comment.trim().length > 0)
        .map((d) => [d.deviationId, d.comment!.trim()] as const)
    );

    // 1. Traer los desvíos con su checklist de origen y las solicitudes que ya los contienen
    const deviations = await prisma.checklist_deviations.findMany({
      where: { id: { in: deviationIds } },
      select: {
        id: true,
        checklist_answer_id: true,
        // Ticket 677: cada desvío sabe a qué unidad pertenece; la solicitud se crea sobre esa
        equipment_id: true,
        company_id: true,
        maintenance_request_items: { select: { maintenance_request_id: true } },
      },
    });

    // Los ids de desvíos llegan del cliente: todos tienen que ser de la empresa del recurso.
    if (deviations.some((d) => d.company_id !== companyId)) {
      return { ok: false, error: 'Algún desvío no pertenece a la empresa del equipo' };
    }

    const manualItemLabels = (input.manualItems ?? []).map((m) => m.label.trim()).filter((label) => label.length > 0);

    if (deviations.length === 0 && manualItemLabels.length === 0) {
      serverLogger.warn('No se encontraron desvíos para procesar', { data: { deviationIds } });
      return { ok: false, error: 'No se encontraron los desvíos indicados' };
    }

    // 2. Separar los desvíos que YA pertenecen a una solicitud de los que todavía no tienen ninguna
    const alreadyLinked = deviations.filter((d) => d.maintenance_request_items.length > 0);
    const unlinked = deviations.filter((d) => d.maintenance_request_items.length === 0);

    // 3. Agrupar los desvíos sin solicitud por checklist de origen + equipo al que aplican.
    //    Cada checklist necesita su propia solicitud: maintenance_requests.checklist_answer_id
    //    referencia un único checklist, así que mezclarlos falsearía el origen de los desvíos.
    //    Y cada equipo también: una solicitud apunta a un único `equipment_id`, así que los
    //    desvíos del enganche no pueden convivir con los de la unidad tractora (ticket 677).
    const NO_CHECKLIST = '__no_checklist__';
    const groupKey = (checklistAnswerId: string, equipmentId: string) => `${checklistAnswerId}|${equipmentId}`;
    const deviationGroups = new Map<
      string,
      { checklistAnswerId: string | null; equipmentId: string; deviationIds: string[] }
    >();

    for (const deviation of unlinked) {
      const checklistKey = deviation.checklist_answer_id ?? input.checklistAnswerId ?? NO_CHECKLIST;
      const equipmentId = deviation.equipment_id ?? input.equipmentId;
      const key = groupKey(checklistKey, equipmentId);
      const group = deviationGroups.get(key) ?? {
        checklistAnswerId: checklistKey === NO_CHECKLIST ? null : checklistKey,
        equipmentId,
        deviationIds: [],
      };
      group.deviationIds.push(deviation.id);
      deviationGroups.set(key, group);
    }

    // 4. Buscar solicitudes ABIERTAS para reutilizar (una aprobada nunca se modifica).
    //    La coincidencia es por checklist Y equipo: son las dos columnas que definen la solicitud.
    const checklistKeys = [
      ...new Set(
        [...deviationGroups.values()]
          .map((group) => group.checklistAnswerId)
          .filter((checklistAnswerId): checklistAnswerId is string => !!checklistAnswerId)
      ),
    ];

    const equipmentIds = [...new Set([...deviationGroups.values()].map((group) => group.equipmentId))];

    const openRequests = checklistKeys.length
      ? await prisma.maintenance_requests.findMany({
          where: {
            equipment_id: { in: equipmentIds },
            status: { in: [...OPEN_REQUEST_STATUSES] },
            checklist_answer_id: { in: checklistKeys },
          },
          select: { id: true, checklist_answer_id: true, equipment_id: true },
        })
      : [];

    const openRequestByGroup = new Map<string, string>();
    for (const request of openRequests) {
      if (!request.checklist_answer_id || !request.equipment_id) continue;
      const key = groupKey(request.checklist_answer_id, request.equipment_id);
      if (!openRequestByGroup.has(key)) {
        openRequestByGroup.set(key, request.id);
      }
    }

    // Datos de origen del checklist. Necesarios cuando la solicitud se crea desde la tabla de
    // desvíos acumulados, donde el modal no aporta chofer, kilometraje ni quién cargó el checklist.
    const checklistAnswers = checklistKeys.length
      ? await prisma.checklist_answers.findMany({
          where: { id: { in: checklistKeys } },
          select: { id: true, employee_id: true, chofer_employee_id: true, user_id: true, kilometraje: true },
        })
      : [];

    const checklistAnswerById = new Map(checklistAnswers.map((answer) => [answer.id, answer] as const));

    // Solicitudes que ya contienen los desvíos previamente vinculados: solo se refresca el
    // supervisor de las que siguen abiertas.
    const linkedRequestIds = [
      ...new Set(alreadyLinked.flatMap((d) => d.maintenance_request_items.map((item) => item.maintenance_request_id))),
    ];

    const openLinkedRequests = linkedRequestIds.length
      ? await prisma.maintenance_requests.findMany({
          where: { id: { in: linkedRequestIds }, status: { in: [...OPEN_REQUEST_STATUSES] } },
          select: { id: true, equipment_id: true },
        })
      : [];

    const openLinkedRequestIds = openLinkedRequests.map((request) => request.id);
    /** Solicitudes abiertas de la unidad desde la que se abrió el modal (no las del enganche) */
    const openLinkedContextRequestIds = openLinkedRequests
      .filter((request) => request.equipment_id === input.equipmentId)
      .map((request) => request.id);

    let createdCount = 0;
    let updatedCount = 0;
    let itemsAdded = 0;
    let primaryRequestId: string | undefined;
    /** Solicitud correspondiente a la unidad del contexto: es donde van los ítems manuales */
    let contextRequestId: string | undefined;

    await prisma.$transaction(async (tx) => {
      const touchedRequestIds = new Set<string>(openLinkedRequestIds);

      // 5. Una solicitud por checklist + equipo: reutilizar la abierta o crear una nueva
      for (const [key, group] of deviationGroups) {
        const { checklistAnswerId, equipmentId: groupEquipmentId, deviationIds: groupDeviationIds } = group;
        const reusableRequestId = checklistAnswerId ? openRequestByGroup.get(key) : undefined;
        let targetRequestId: string;

        if (reusableRequestId) {
          targetRequestId = reusableRequestId;
          updatedCount += 1;
        } else {
          const sourceAnswer = checklistAnswerId ? checklistAnswerById.get(checklistAnswerId) : undefined;
          // El kilometraje del checklist es el del odómetro de la unidad tractora. Si la
          // solicitud es de otra unidad (el enganche), no le corresponde: al aprobar la
          // entrada a taller ese valor se escribe en `vehicles.kilometer` del recurso, y
          // le estaríamos cargando al acoplado los km del camión (ticket 677).
          const isContextEquipment = groupEquipmentId === input.equipmentId;
          const groupCompanyId = await resolveCompanyId(tx, groupEquipmentId);

          const created = await tx.maintenance_requests.create({
            data: {
              checklist_answer_id: checklistAnswerId,
              // Ticket 677: la unidad del desvío, no la del contexto del modal
              equipment_id: groupEquipmentId,
              company_id: groupCompanyId,
              employee_id: input.employeeId ?? sourceAnswer?.employee_id ?? null,
              user_id: input.userId ?? sourceAnswer?.user_id ?? profile.id,
              kilometer: isContextEquipment ? input.kilometer ?? sourceAnswer?.kilometraje?.toString() ?? null : null,
              supervisor_id: input.supervisorId,
              status: 'pending_approval',
              driver_employee_id: input.driverEmployeeId ?? sourceAnswer?.chofer_employee_id ?? null,
            },
            select: { id: true },
          });
          targetRequestId = created.id;
          createdCount += 1;
        }

        touchedRequestIds.add(targetRequestId);

        // La solicitud "principal" es la del checklist que originó la operación
        if (!primaryRequestId || (input.checklistAnswerId && checklistAnswerId === input.checklistAnswerId)) {
          primaryRequestId = targetRequestId;
        }

        if (!contextRequestId && groupEquipmentId === input.equipmentId) {
          contextRequestId = targetRequestId;
        }

        // Los ítems heredan la empresa de la solicitud (la de su unidad), aunque la solicitud
        // se reutilice: una abierta sobre el enganche pertenece a la empresa del enganche.
        const targetCompanyId = await resolveCompanyId(tx, groupEquipmentId);

        const { count } = await tx.maintenance_request_items.createMany({
          data: groupDeviationIds.map((deviationId) => ({
            maintenance_request_id: targetRequestId,
            company_id: targetCompanyId,
            checklist_deviation_id: deviationId,
            repair_type_id: null,
            driver_comment: commentByDeviationId.get(deviationId) ?? null,
            driver_comment_by: commentByDeviationId.has(deviationId) ? profile.id : null,
            status: 'pending',
          })),
          skipDuplicates: true,
        });

        itemsAdded += count;
      }

      // 6. Ítems manuales (texto libre): van a la solicitud del checklist en curso, y siempre
      //    sobre la unidad desde la que se abrió el modal — nunca sobre la del enganche, que
      //    tiene su propia solicitud (ticket 677).
      if (manualItemLabels.length > 0) {
        let manualRequestId = contextRequestId ?? openLinkedContextRequestIds[0];
        let manualChecklistAnswerId = input.checklistAnswerId ?? null;

        if (!manualRequestId) {
          const created = await tx.maintenance_requests.create({
            data: {
              checklist_answer_id: manualChecklistAnswerId,
              equipment_id: input.equipmentId,
              company_id: companyId,
              employee_id: input.employeeId ?? null,
              user_id: input.userId ?? profile.id,
              kilometer: input.kilometer ?? null,
              supervisor_id: input.supervisorId,
              status: 'pending_approval',
              driver_employee_id: input.driverEmployeeId ?? null,
            },
            select: { id: true },
          });
          manualRequestId = created.id;
          createdCount += 1;
          primaryRequestId = created.id;
        }

        touchedRequestIds.add(manualRequestId);

        if (!manualChecklistAnswerId) {
          const request = await tx.maintenance_requests.findUnique({
            where: { id: manualRequestId },
            select: { checklist_answer_id: true },
          });
          manualChecklistAnswerId = request?.checklist_answer_id ?? null;
        }

        for (const label of manualItemLabels) {
          const manualDeviation = await tx.checklist_deviations.create({
            data: {
              checklist_answer_id: manualChecklistAnswerId,
              equipment_id: input.equipmentId,
              company_id: companyId,
              item_code: 'manual',
              item_label: label,
              section_code: null,
              is_critical: false,
              created_by_user_id: profile.id,
            },
            select: { id: true },
          });

          await tx.maintenance_request_items.create({
            data: {
              maintenance_request_id: manualRequestId,
              company_id: companyId,
              checklist_deviation_id: manualDeviation.id,
              repair_type_id: null,
              driver_comment: null,
              status: 'pending',
            },
          });

          itemsAdded += 1;
        }
      }

      // 7. Comentarios del chofer: se guardan en el desvío y en su ítem
      for (const [deviationId, comment] of commentByDeviationId) {
        await tx.checklist_deviations.update({
          where: { id: deviationId },
          data: { driver_comment: comment },
        });

        await tx.maintenance_request_items.updateMany({
          where: { checklist_deviation_id: deviationId },
          data: { driver_comment: comment, driver_comment_by: profile.id },
        });
      }

      // 8. Supervisor de turno: solo sobre las solicitudes ABIERTAS tocadas en esta operación.
      //    Una solicitud ya aprobada conserva su supervisor original.
      if (touchedRequestIds.size > 0) {
        await tx.maintenance_requests.updateMany({
          where: { id: { in: [...touchedRequestIds] }, status: { in: [...OPEN_REQUEST_STATUSES] } },
          data: { supervisor_id: input.supervisorId, updated_at: new Date() },
        });
      }
    });

    serverLogger.info('Desvíos procesados', {
      data: {
        equipmentId: input.equipmentId,
        createdCount,
        updatedCount,
        itemsAdded,
        alreadyLinkedCount: alreadyLinked.length,
      },
    });

    await invalidateCacheTags(INVALIDATION_MAP.createMaintenanceRequest);

    return {
      ok: true,
      requestId: primaryRequestId,
      created: createdCount > 0,
      createdCount,
      updatedCount,
      itemsAdded,
      alreadyLinkedCount: alreadyLinked.length,
    };
  } catch (error) {
    serverLogger.error('Error inesperado en createOrUpdateMaintenanceRequest', { data: { error } });
    return { ok: false, error: 'Error inesperado al procesar la solicitud' };
  }
}

/**
 * Crea desvíos manuales sobre un checklist ya guardado (sin ítems fallidos automáticos)
 * junto con su solicitud de mantenimiento. Todo en una sola transacción.
 *
 * Flujo: checklist_deviations → maintenance_requests → maintenance_request_items.
 * Los desvíos quedan vinculados al checklist_answer_id (a diferencia de los desvíos
 * manuales de NuevoPedido que son huérfanos).
 */
export async function createManualDeviationsFromChecklist(input: {
  checklistAnswerId: string;
  equipmentId: string;
  supervisorId: string;
  driverEmployeeId?: string;
  employeeId?: string;
  userId?: string;
  kilometer?: string;
  items: Array<{
    templateItemId: string;
    itemCode: string;
    itemLabel: string;
    sectionCode: string;
    isCritical: boolean;
    comment?: string;
  }>;
  /** Ítems manuales (texto libre, no del template) */
  manualItems?: Array<{ label: string }>;
}): Promise<{ ok: true; requestId: string; deviationIds: string[] } | { ok: false; error: string }> {
  serverLogger.info('createManualDeviationsFromChecklist - Iniciando', {
    data: {
      checklistAnswerId: input.checklistAnswerId,
      equipmentId: input.equipmentId,
      itemsCount: input.items.length,
    },
  });

  if (input.manualItems && input.manualItems.length > 0) {
    serverLogger.debug('Se incluyeron ítems manuales', {
      data: { count: input.manualItems.length },
    });
  }

  const manualCount = (input.manualItems ?? []).filter((m) => m.label.trim().length > 0).length;
  if (input.items.length === 0 && manualCount === 0) {
    return { ok: false, error: 'Debe agregar al menos un ítem' };
  }

  try {
    const profile = await requireServerAuthProfile();

    const answer = await prisma.checklist_answers.findUnique({
      where: { id: input.checklistAnswerId },
      select: { id: true, equipment_id: true },
    });

    if (!answer || answer.equipment_id !== input.equipmentId) {
      serverLogger.error('checklist_answer invalido o no coincide con equipo', {
        data: { checklistAnswerId: input.checklistAnswerId, equipmentId: input.equipmentId },
      });
      return { ok: false, error: 'Checklist no encontrado o no coincide con el equipo' };
    }

    const userId = input.userId ?? profile.id;
    // Perímetro de dos caminos (operario del QR de la empresa del equipo, o dashboard con
    // `nuevo_pedido:create` en la empresa activa): la empresa sale del recurso, pero quien llama
    // tiene que pertenecer a ella.
    const { companyId } = await requireResourceAccess('vehicle', input.equipmentId, {
      dashboardPermissions: [NUEVO_PEDIDO_CREATE],
      modules: ['mantenimiento'],
    });
    // El supervisor elegido llega del cliente: tiene que ser un usuario de la empresa del equipo.
    await assertSupervisorInCompany(input.supervisorId, companyId);

    const result = await prisma.$transaction(async (tx) => {
      const createdDeviations = await Promise.all(
        input.items.map((item) =>
          tx.checklist_deviations.create({
            data: {
              checklist_answer_id: input.checklistAnswerId,
              equipment_id: input.equipmentId,
              company_id: companyId,
              item_code: item.itemCode,
              item_label: item.itemLabel,
              section_code: item.sectionCode,
              is_critical: item.isCritical,
              driver_comment: item.comment?.trim() || null,
              created_by_user_id: profile.id,
            },
            select: { id: true },
          })
        )
      );

      let deviationIds = createdDeviations.map((d) => d.id);

      const request = await tx.maintenance_requests.create({
        data: {
          checklist_answer_id: input.checklistAnswerId,
          equipment_id: input.equipmentId,
          company_id: companyId,
          employee_id: input.employeeId ?? null,
          user_id: userId,
          kilometer: input.kilometer ?? null,
          supervisor_id: input.supervisorId,
          status: 'pending_approval',
          driver_employee_id: input.driverEmployeeId ?? null,
        },
        select: { id: true },
      });

      await tx.maintenance_request_items.createMany({
        data: input.items.map((item, idx) => ({
          maintenance_request_id: request.id,
          company_id: companyId,
          checklist_deviation_id: deviationIds[idx],
          repair_type_id: null,
          driver_comment: item.comment?.trim() || null,
          driver_comment_by: item.comment?.trim() ? profile.id : null,
          status: 'pending',
        })),
      });

      // Crear ítems manuales (texto libre, no del template)
      if (input.manualItems && input.manualItems.length > 0) {
        const manualDevs = await Promise.all(
          input.manualItems
            .filter((m) => m.label.trim().length > 0)
            .map((m) =>
              tx.checklist_deviations.create({
                data: {
                  checklist_answer_id: input.checklistAnswerId,
                  equipment_id: input.equipmentId,
                  company_id: companyId,
                  item_code: 'manual',
                  item_label: m.label.trim(),
                  section_code: null,
                  is_critical: false,
                  created_by_user_id: profile.id,
                },
                select: { id: true },
              })
            )
        );

        if (manualDevs.length > 0) {
          await tx.maintenance_request_items.createMany({
            data: manualDevs.map((d) => ({
              maintenance_request_id: request.id,
              company_id: companyId,
              checklist_deviation_id: d.id,
              repair_type_id: null,
              driver_comment: null,
              status: 'pending',
            })),
          });
          deviationIds = [...deviationIds, ...manualDevs.map((d) => d.id)];
        }
      }

      return { requestId: request.id, deviationIds };
    });

    serverLogger.info('createManualDeviationsFromChecklist - OK', {
      data: { requestId: result.requestId, deviationsCount: result.deviationIds.length },
    });

    await invalidateCacheTags(INVALIDATION_MAP.createMaintenanceRequest);

    return { ok: true, requestId: result.requestId, deviationIds: result.deviationIds };
  } catch (error) {
    serverLogger.error('Error en createManualDeviationsFromChecklist', { data: { error } });
    return { ok: false, error: 'Error inesperado al registrar los desvíos' };
  }
}
