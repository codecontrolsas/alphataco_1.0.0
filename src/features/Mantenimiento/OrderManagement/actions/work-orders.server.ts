'use server';

import { buildWorkOrderNumber } from '@/features/Mantenimiento/lib/work-order-generation';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import {
  getResourceKind,
  getResourceLabel,
  resourceIdFields,
} from '@/features/Mantenimiento/shared/maintenance-resource';
import { getMaintenanceOrderCompanyId } from '@/features/Mantenimiento/shared/resource-company';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { z } from 'zod';
import { lockEditableOrder, OrderManagementError, requireOrderManagementPermissions, toFailure } from './access';
import {
  applyChiefCommentUpdates,
  applyDescriptionUpdates,
  applyItemAdds,
  applyItemDeletes,
  applyRepairTypeUpdates,
  requiredActionsForChanges,
} from './item-changes';
import {
  orderChangeSetSchema,
  orderIdSchema,
  plannedDatesSchema,
  wizardSectorAssignmentsSchema,
  wizardSectorOrderSchema,
} from '../schemas/order-changes';
import { assertOrderInActiveCompany, assertSectorInCompany } from './perimeter';
import { DIAGNOSTICO_REPAIR_TYPE_ID } from '../../utils/constants';
import type { OrderChangeSet } from '../schemas/order-changes';
import { getOrderGenerationPreview } from './queries.server';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { nextWorkOrderSequence } from '@/features/Mantenimiento/shared/order-numbering';

const logger = new Logger('OrderManagement/work-orders');

/** Núcleo sin chequeo de permisos: lo llaman las dos acciones exportadas, que ya lo verificaron. */
async function generateWorkOrdersCore(
  orderId: string,
  dates: { plannedStartDate: string; plannedEndDate: string }
) {
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);

  const profile = await requireServerAuthProfile();

  logger.info('Generando ordenes de trabajo para orden', { data: { orderId } });

  try {
    // 1. Obtener preview para saber que generar
    const preview = await getOrderGenerationPreview(orderId);

    if (preview.sectors.length === 0) {
      throw new Error('No hay items elegibles para generar ordenes de trabajo');
    }

    // Ticket 596: el pedido apunta a un vehiculo O a un equipamiento (excluyentes)
    const resource = { vehicles: preview.vehicle, other_equipment: preview.otherEquipment };
    const resourceId = preview.equipmentId ?? preview.otherEquipmentId;
    const companyId = preview.vehicle?.company_id ?? preview.otherEquipment?.company_id ?? null;

    if (!resourceId || !(preview.vehicle ?? preview.otherEquipment)) {
      throw new Error('No se pudo obtener informacion del equipo');
    }

    if (!companyId) throw new Error('No se pudo determinar la empresa');

    const resourceKind = getResourceKind(resource);

    // 2. Obtener el workshop_id de la primera asignacion que tenga sector asignado
    const workshopItem = await prisma.maintenance_order_items.findFirst({
      where: {
        maintenance_order_id: orderId,
        assigned_sector_id: { not: null },
      },
      select: { assigned_workshop_id: true, assigned_sector_id: true },
    });

    // Si no hay workshop asignado directamente, obtenerlo del sector
    let workshopId: string | null = workshopItem?.assigned_workshop_id ?? null;
    if (!workshopId && preview.sectors.length > 0 && preview.sectors[0].sectorId) {
      const sectorData = await prisma.workshop_sectors.findUnique({
        where: { id: preview.sectors[0].sectorId },
        select: { workshop_id: true },
      });
      workshopId = sectorData?.workshop_id ?? null;
    }

    if (!workshopId) throw new Error('No se pudo determinar el taller');

    const createdOrders: Array<{ orderNumber: string; sectorName: string; itemCount: number }> = [];

    // 3. Por cada sector/taller externo, crear una OT
    for (const sector of preview.sectors) {
      // Determinar workshop_id y sector_id para la OT
      const woWorkshopId = sector.isExternal && sector.workshopId ? sector.workshopId : workshopId;
      const woSectorId = sector.isExternal ? null : sector.sectorId;

      // Crear la OT y sus items en una transacción por sector
      const workOrder = await withMaintenanceActor(profile.id, async (tx) => {
        // Orden de locks pedido → OT; además rechaza pedidos en estado terminal.
        await lockEditableOrder(tx, orderId);

        // Con el pedido lockeado se re-verifica que los ítems sigan elegibles: un doble click o
        // dos usuarios a la vez no pueden generar dos OTs para los mismos ítems.
        const sectorItemIds = sector.items.map((i) => i.id);
        const stillEligible = await tx.maintenance_order_items.count({
          where: {
            id: { in: sectorItemIds },
            maintenance_order_id: orderId,
            work_order_id: null,
            is_rejected: false,
          },
        });
        if (stillEligible !== sectorItemIds.length) {
          throw new OrderManagementError(
            'Algunos ítems ya tienen una orden de trabajo generada. Actualice la pantalla e intente de nuevo.'
          );
        }

        // El número de secuencia se toma DENTRO de la transacción y por empresa: el
        // `max()+1` leído afuera repetía el número entre generaciones simultáneas.
        const sequenceNumber = await nextWorkOrderSequence(tx, companyId);

        // Formatear numero de OT: OT-{EQUIPO}-{SECTOR/TALLER}-{SECUENCIA}
        // El identificador sale del recurso: patente/serie del vehiculo, o N° de serie
        // (o interno) del equipamiento, que no tiene dominio.
        const orderNumber = buildWorkOrderNumber({
          resourceLabel: getResourceLabel(resource),
          sectorName: sector.sectorName,
          sequenceNumber,
        });

        // Crear la OT
        const wo = await tx.work_orders.create({
          data: {
            order_number: orderNumber,
            sequence_number: sequenceNumber,
            company_id: companyId,
            ...resourceIdFields(resourceKind, resourceId),
            workshop_id: woWorkshopId,
            sector_id: woSectorId ?? undefined,
            status: 'pending',
            priority: 'medium',
            planned_start_date: new Date(dates.plannedStartDate),
            planned_end_date: new Date(dates.plannedEndDate),
            created_by: profile.id,
          },
        });

        // Crear work_order_items — usando create individual para obtener IDs
        const itemIds = sector.items.map((i) => i.id);
        const createdWoItems = await Promise.all(
          itemIds.map((itemId) =>
            tx.work_order_items.create({
              data: {
                work_order_id: wo.id,
                maintenance_order_item_id: itemId,
                status: 'pending',
              },
              select: { id: true, maintenance_order_item_id: true },
            })
          )
        );

        // Crear work_order_item_repairs (uno por repair type del item)
        const repairRecords: Array<{
          work_order_item_id: string;
          repair_type_id: string;
          status: 'pending';
          company_id: string;
        }> = [];

        for (const woItem of createdWoItems) {
          const originalItem = sector.items.find((i) => i.id === woItem.maintenance_order_item_id);
          if (!originalItem) continue;

          const pivotTypes = originalItem.maintenance_order_item_repair_types ?? [];
          if (pivotTypes.length > 0) {
            for (const pt of pivotTypes) {
              repairRecords.push({
                work_order_item_id: woItem.id,
                repair_type_id: pt.repair_type_id,
                status: 'pending',
                company_id: companyId,
              });
            }
          } else if (originalItem.types_of_repairs) {
            // Fallback al legacy repair type
            repairRecords.push({
              work_order_item_id: woItem.id,
              repair_type_id: originalItem.types_of_repairs.id,
              status: 'pending',
              company_id: companyId,
            });
          }
        }

        if (repairRecords.length > 0) {
          await tx.work_order_item_repairs.createMany({
            data: repairRecords,
            skipDuplicates: true,
          });
        }

        // Actualizar maintenance_order_items con work_order_id
        await tx.maintenance_order_items.updateMany({
          where: { id: { in: itemIds }, maintenance_order_id: orderId },
          data: { work_order_id: wo.id },
        });

        // Incluir item DIAGNÓSTICO del sector (si existe)
        if (sector.sectorId) {
          const diagItem = await tx.maintenance_order_items.findFirst({
            where: {
              maintenance_order_id: orderId,
              assigned_sector_id: sector.sectorId,
              is_diagnostico: true,
              work_order_id: null,
            },
            select: { id: true },
          });

          if (diagItem) {
            const diagWoItem = await tx.work_order_items.create({
              data: {
                work_order_id: wo.id,
                maintenance_order_item_id: diagItem.id,
                status: 'pending',
              },
              select: { id: true },
            });

            await tx.work_order_item_repairs.create({
              data: {
                work_order_item_id: diagWoItem.id,
                repair_type_id: DIAGNOSTICO_REPAIR_TYPE_ID,
                status: 'pending',
                is_diagnostico: true,
                company_id: companyId,
              },
            });

            // Vincular maintenance_order_item DIAGNÓSTICO con la OT
            await tx.maintenance_order_items.update({
              where: { id: diagItem.id },
              data: { work_order_id: wo.id },
            });

            logger.info('Item DIAGNÓSTICO incluido en OT', {
              data: { workOrderId: wo.id, diagItemId: diagItem.id },
            });
          }
        }

        await logActivity(tx, {
          workOrderId: wo.id,
          maintenanceOrderId: orderId,
          actionType: ACTIVITY_LOG.WORK_ORDER_CREATED,
          performedBy: profile.id,
          newStatus: 'pending',
          metadata: {
            orderNumber: wo.order_number,
            sectorName: sector.sectorName,
            plannedStartDate: dates.plannedStartDate,
            plannedEndDate: dates.plannedEndDate,
            isExternal: sector.isExternal,
          },
        });

        return wo;
      });

      createdOrders.push({
        orderNumber: workOrder.order_number,
        sectorName: sector.sectorName,
        itemCount: sector.items.length,
      });

      logger.info('OT creada para sector', {
        data: {
          orderNumber: workOrder.order_number,
          sector: sector.sectorName,
          items: sector.items.length,
        },
      });
    }

    await withMaintenanceActor(profile.id, async (tx) => {
      await logActivity(tx, {
        maintenanceOrderId: orderId,
        actionType: ACTIVITY_LOG.WORK_ORDERS_GENERATED,
        performedBy: profile.id,
        metadata: {
          workOrders: createdOrders.map((co) => ({
            orderNumber: co.orderNumber,
            sectorName: co.sectorName,
            itemCount: co.itemCount,
          })),
        },
      });
    });

    logger.info('Ordenes de trabajo generadas exitosamente', {
      data: { orderId, count: createdOrders.length },
    });

    await invalidateCacheTags(INVALIDATION_MAP.generateWorkOrdersForOrder);
    return createdOrders;
  } catch (error) {
    logger.error('Error generando ordenes de trabajo', { data: { error, orderId } });
    throw error;
  }
}

// =============================================================================
// WIZARD: SECTOR CANDIDATES
// =============================================================================

/**
 * Ejecuta todo el flujo del wizard en una sola acción:
 * 1. Aplica cambios de items (adds, deletes, repair type updates, description updates)
 * 2. Asigna items a sectores + crea DIAGNOSTICO por sector
 * 3. Actualiza el sector_sequence_order de todos los items
 * 4. Genera las OTs agrupadas por sector
 */
export type SetupAndGenerateResult =
  | { ok: true; workOrders: Array<{ orderNumber: string; sectorName: string; itemCount: number }> }
  | { ok: false; message: string };

export async function setupAndGenerateWorkOrders(
  orderId: string,
  rawItemChanges: OrderChangeSet,
  rawSectorAssignments: Array<{ itemIds: string[]; sectorId: string }>,
  rawSectorOrder: Array<{ sectorId: string; sequenceOrder: number }>,
  rawDates: { plannedStartDate: string; plannedEndDate: string }
): Promise<SetupAndGenerateResult> {
  try {
    orderIdSchema.parse(orderId);
    const itemChanges = orderChangeSetSchema.parse(rawItemChanges);
    const sectorAssignments = wizardSectorAssignmentsSchema.parse(rawSectorAssignments);
    const sectorOrder = wizardSectorOrderSchema.parse(rawSectorOrder);
    const dates = plannedDatesSchema.parse(rawDates);

    // Permisos: generar es un alta; además cada tipo de cambio exige su acción. Asignar sectores
    // es una edición.
    await requireOrderManagementPermissions([
      'create',
      ...requiredActionsForChanges(itemChanges),
      ...(sectorAssignments.length > 0 ? (['update'] as const) : []),
    ]);

    // Perímetro: el pedido tiene que ser de la empresa activa.
    await assertOrderInActiveCompany(orderId);

    const profile = await requireServerAuthProfile();

    logger.info('Wizard: iniciando setup y generacion de OTs', {
      data: {
        orderId,
        itemChanges: {
          adds: itemChanges.adds.length,
          deletes: itemChanges.deletes.length,
          repairTypeUpdates: itemChanges.repairTypeUpdates.length,
          descriptionUpdates: itemChanges.descriptionUpdates.length,
        },
        sectorAssignments: sectorAssignments.length,
        sectorOrder: sectorOrder.length,
      },
    });

    await withMaintenanceActor(profile.id, async (tx) => {
      await lockEditableOrder(tx, orderId);
      const companyId = await getMaintenanceOrderCompanyId(tx, orderId);

      // 1. APLICAR CAMBIOS DE ITEMS (mismas reglas de perímetro que `saveOrderChanges`)
      await applyItemDeletes(tx, orderId, itemChanges.deletes);
      await applyItemAdds(tx, orderId, companyId, itemChanges.adds);
      await applyRepairTypeUpdates(tx, orderId, companyId, itemChanges.repairTypeUpdates);
      await applyDescriptionUpdates(tx, orderId, itemChanges.descriptionUpdates);
      await applyChiefCommentUpdates(tx, orderId, profile.id, itemChanges.chiefCommentUpdates);

      // 2. ASIGNAR ITEMS A SECTORES + CREAR DIAGNOSTICO
      // Backend safeguard: normalize sector order considering sectors that already have work orders
      const existingSequences = await tx.maintenance_order_items.findMany({
        where: {
          maintenance_order_id: orderId,
          work_order_id: { not: null },
          assigned_sector_id: { not: null },
          sector_sequence_order: { not: null },
        },
        select: { sector_sequence_order: true },
      });

      const maxExistingSeq = existingSequences.reduce((max, item) => Math.max(max, item.sector_sequence_order ?? 0), 0);

      // Sort incoming sector order and re-normalize starting from maxExistingSeq + 1
      const sortedSectorOrder = [...sectorOrder].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const normalizedSectorOrder = sortedSectorOrder.map((so, idx) => ({
        ...so,
        sequenceOrder: maxExistingSeq + idx + 1,
      }));

      // Construir mapa de sectorId → sequenceOrder (normalized)
      const sectorSequenceMap = new Map<string, number>();
      for (const so of normalizedSectorOrder) {
        sectorSequenceMap.set(so.sectorId, so.sequenceOrder);
      }

      for (const assignment of sectorAssignments) {
        // El sector llega del cliente: tiene que ser de la empresa del pedido.
        await assertSectorInCompany(assignment.sectorId, companyId);
        const seqOrder = sectorSequenceMap.get(assignment.sectorId) ?? 1;

        // Filtrar IDs reales (descartar temp IDs que no se pudieron resolver)
        const realIds = assignment.itemIds.filter((id) => z.string().uuid().safeParse(id).success);
        if (realIds.length > 0) {
          await tx.maintenance_order_items.updateMany({
            where: { id: { in: realIds }, maintenance_order_id: orderId },
            data: {
              assigned_sector_id: assignment.sectorId,
              sector_sequence_order: seqOrder,
              assigned_by: profile.id,
              assigned_at: new Date(),
            },
          });
        }

        // Crear item DIAGNOSTICO si no existe para este sector
        const existingDiag = await tx.maintenance_order_items.findFirst({
          where: {
            maintenance_order_id: orderId,
            assigned_sector_id: assignment.sectorId,
            is_diagnostico: true,
          },
          select: { id: true },
        });

        if (!existingDiag) {
          await tx.maintenance_order_items.create({
            data: {
              maintenance_order_id: orderId,
              company_id: companyId,
              assigned_sector_id: assignment.sectorId,
              sector_sequence_order: seqOrder,
              is_diagnostico: true,
              description: 'DIAGNOSTICO',
              assigned_by: profile.id,
              assigned_at: new Date(),
            },
          });
        }
      }

      // Grouped audit log: capture all wizard changes in a single entry (gestión)
      const groupedMetadata: Record<string, unknown> = {};
      if (itemChanges.deletes.length > 0) groupedMetadata.deletes = itemChanges.deletes;
      if (itemChanges.adds.length > 0) groupedMetadata.adds = itemChanges.adds;
      if (itemChanges.repairTypeUpdates.length > 0) groupedMetadata.repairTypeUpdates = itemChanges.repairTypeUpdates;
      if (itemChanges.descriptionUpdates.length > 0)
        groupedMetadata.descriptionUpdates = itemChanges.descriptionUpdates;
      if (itemChanges.chiefCommentUpdates.length > 0)
        groupedMetadata.chiefCommentUpdates = itemChanges.chiefCommentUpdates;
      if (sectorAssignments.length > 0) {
        groupedMetadata.sectorAssignments = sectorAssignments.map((a) => ({
          itemIds: a.itemIds,
          sectorId: a.sectorId,
          sequenceOrder: sectorSequenceMap.get(a.sectorId) ?? null,
        }));
      }
      if (Object.keys(groupedMetadata).length > 0) {
        await logActivity(tx, {
          maintenanceOrderId: orderId,
          actionType: ACTIVITY_LOG.ORDER_ITEMS_UPDATED,
          performedBy: profile.id,
          metadata: { ...groupedMetadata, source: 'wizard' },
        });
      }
    });

    // 3. GENERAR OTs (fuera de la transacción anterior para evitar timeouts)
    const workOrders = await generateWorkOrdersCore(orderId, dates);

    logger.info('Wizard: setup y generacion completados', {
      data: { orderId, workOrdersCreated: workOrders.length },
    });

    await invalidateCacheTags(INVALIDATION_MAP.setupAndGenerateWorkOrders);
    return { ok: true, workOrders };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? 'Los datos enviados son inválidos' };
    }
    logger.error('Error en wizard setup y generacion', { data: { error, orderId } });
    return toFailure(error);
  }
}
