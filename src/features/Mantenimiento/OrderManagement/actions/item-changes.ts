import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { filterRepairTypeIdsForCompany } from './perimeter';
import type { OrderChangeSet, RepairTypeDelta } from '../schemas/order-changes';

/**
 * Aplicación de los cambios de ítems del wizard dentro de una transacción ya abierta.
 * Compartido por `saveOrderChanges` y `setupAndGenerateWorkOrders` para que ambos apliquen
 * exactamente las mismas reglas de perímetro (todo id del cliente se ata al pedido validado).
 *
 * Módulo server-only (NO es una Server Action).
 */

type Tx = Prisma.TransactionClient;

/** Elimina ítems manuales (o diagnóstico) del pedido. Devuelve cuántos borró. */
export async function applyItemDeletes(tx: Tx, orderId: string, itemIds: string[]): Promise<number> {
  let deleted = 0;
  for (const itemId of itemIds) {
    const item = await tx.maintenance_order_items.findFirst({
      where: { id: itemId, maintenance_order_id: orderId },
      select: { id: true, maintenance_request_item_id: true, is_diagnostico: true },
    });
    if (item && (!item.maintenance_request_item_id || item.is_diagnostico)) {
      // ON DELETE CASCADE elimina el pivot automáticamente
      await tx.maintenance_order_items.delete({ where: { id: item.id } });
      deleted += 1;
    }
  }
  return deleted;
}

/** Crea ítems nuevos con sus tipos. Devuelve los ids creados, en el orden de `adds`. */
export async function applyItemAdds(
  tx: Tx,
  orderId: string,
  companyId: string,
  adds: OrderChangeSet['adds']
): Promise<string[]> {
  const createdIds: string[] = [];
  for (const add of adds) {
    const repairTypeIds = await filterRepairTypeIdsForCompany(add.repairTypeIds, companyId);
    const newItem = await tx.maintenance_order_items.create({
      data: {
        maintenance_order_id: orderId,
        company_id: companyId,
        description: add.description,
        repair_type_id: repairTypeIds[0] ?? null,
      },
    });
    if (repairTypeIds.length > 0) {
      await tx.maintenance_order_item_repair_types.createMany({
        data: repairTypeIds.map((repairTypeId) => ({
          maintenance_order_item_id: newItem.id,
          repair_type_id: repairTypeId,
        })),
        skipDuplicates: true,
      });
    }
    createdIds.push(newItem.id);
  }
  return createdIds;
}

/**
 * Aplica ALTAS y BAJAS de tipos de reparación de un ítem.
 *
 * El DELETE se acota a `item = X AND tipo IN (remove)` y el INSERT solo a `add`: un tipo que no
 * aparece en ninguna de las dos listas no se toca. Mantiene el campo legacy `repair_type_id`
 * (el primero que queda). Devuelve `null` si el ítem no es del pedido.
 */
export async function applyRepairTypeDelta(
  tx: Tx,
  orderId: string,
  companyId: string,
  itemId: string,
  delta: RepairTypeDelta
): Promise<{ added: number; removed: number } | null> {
  const item = await tx.maintenance_order_items.findFirst({
    where: { id: itemId, maintenance_order_id: orderId },
    select: { id: true, repair_type_id: true },
  });
  if (!item) return null;

  const toAdd = await filterRepairTypeIdsForCompany([...new Set(delta.add)], companyId);
  const toRemove = [...new Set(delta.remove)].filter((id) => !toAdd.includes(id));

  if (toAdd.length === 0 && toRemove.length === 0) return { added: 0, removed: 0 };

  // Ítems viejos con el tipo solo en el campo legacy `repair_type_id` (sin fila en el pivot):
  // el wizard lo muestra como un tipo más, así que se materializa en el pivot antes de aplicar
  // el delta; si no, agregar otro tipo lo dejaría afuera sin que nadie lo haya quitado.
  if (item.repair_type_id && !toRemove.includes(item.repair_type_id)) {
    await tx.maintenance_order_item_repair_types.createMany({
      data: [{ maintenance_order_item_id: itemId, repair_type_id: item.repair_type_id }],
      skipDuplicates: true,
    });
  }

  let removed = 0;
  if (toRemove.length > 0) {
    const res = await tx.maintenance_order_item_repair_types.deleteMany({
      where: { maintenance_order_item_id: itemId, repair_type_id: { in: toRemove } },
    });
    removed = res.count;
  }

  let added = 0;
  if (toAdd.length > 0) {
    const res = await tx.maintenance_order_item_repair_types.createMany({
      data: toAdd.map((repairTypeId) => ({ maintenance_order_item_id: itemId, repair_type_id: repairTypeId })),
      skipDuplicates: true,
    });
    added = res.count;
  }

  // Campo legacy: se conserva el actual si sigue vigente; si no, el primero que queda en el pivot.
  const remaining = await tx.maintenance_order_item_repair_types.findMany({
    where: { maintenance_order_item_id: itemId },
    select: { repair_type_id: true },
    orderBy: { created_at: 'asc' },
  });
  const remainingIds = remaining.map((row) => row.repair_type_id);
  const legacy =
    item.repair_type_id && remainingIds.includes(item.repair_type_id) ? item.repair_type_id : (remainingIds[0] ?? null);
  if (legacy !== item.repair_type_id) {
    await tx.maintenance_order_items.update({ where: { id: itemId }, data: { repair_type_id: legacy } });
  }

  return { added, removed };
}

export async function applyRepairTypeUpdates(
  tx: Tx,
  orderId: string,
  companyId: string,
  updates: OrderChangeSet['repairTypeUpdates']
): Promise<{ added: number; removed: number }> {
  const totals = { added: 0, removed: 0 };
  for (const update of updates) {
    const result = await applyRepairTypeDelta(tx, orderId, companyId, update.itemId, update);
    if (result) {
      totals.added += result.added;
      totals.removed += result.removed;
    }
  }
  return totals;
}

export async function applyDescriptionUpdates(
  tx: Tx,
  orderId: string,
  updates: OrderChangeSet['descriptionUpdates']
): Promise<void> {
  for (const update of updates) {
    await tx.maintenance_order_items.updateMany({
      where: { id: update.itemId, maintenance_order_id: orderId },
      data: { description: update.description },
    });
  }
}

export async function applyChiefCommentUpdates(
  tx: Tx,
  orderId: string,
  profileId: string,
  updates: OrderChangeSet['chiefCommentUpdates']
): Promise<void> {
  for (const update of updates) {
    await tx.maintenance_order_items.updateMany({
      where: { id: update.itemId, maintenance_order_id: orderId },
      data: { workshop_chief_comment: update.comment, workshop_chief_comment_by: profileId },
    });
  }
}

/** Qué acciones de `gestion_ordenes` exige un conjunto de cambios. */
export function requiredActionsForChanges(changes: OrderChangeSet): Array<'create' | 'update' | 'delete'> {
  const actions: Array<'create' | 'update' | 'delete'> = [];
  if (changes.adds.length > 0) actions.push('create');
  if (changes.deletes.length > 0) actions.push('delete');
  const hasUpdates =
    changes.sectorAssignments.length > 0 ||
    changes.repairTypeUpdates.length > 0 ||
    changes.sequenceUpdates.length > 0 ||
    changes.descriptionUpdates.length > 0 ||
    changes.chiefCommentUpdates.length > 0 ||
    changes.workshopAssignments.length > 0 ||
    (changes.rejections?.length ?? 0) > 0 ||
    (changes.restorations?.length ?? 0) > 0;
  if (hasUpdates) actions.push('update');
  return actions;
}
