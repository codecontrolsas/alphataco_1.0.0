import { visibleEquipmentTypeCondition } from '../../shared/maintenance-resource';

/**
 * `where` de cada categoría de decisión de Mi bandeja. Es UNA sola definición para la lista y para el contador
 * (header de la bandeja y resumen del pipeline), así los números no se desfasan. Módulo sin directiva: lo importan
 * archivos `'use server'` y los de `'use cache'`.
 *
 * `hiddenTypeIds` (ticket 690) ya viene resuelto: las funciones cacheadas no pueden leer la sesión.
 */

export function pendingApprovalWhere(companyId: string, hiddenTypeIds: readonly string[]) {
  return repairsWhere('pending_approval', companyId, hiddenTypeIds);
}

/**
 * Estados del pedido en los que todavía se puede mover una tarea entre sectores (un rechazado vuelve a taller). Es la
 * guarda que exige `reassignTaskToSector` y también filtra la bandeja: una tarea cuyo pedido ya no está en taller no
 * se puede resolver, así que no se ofrece ni se cuenta.
 */
export const REASSIGNABLE_ORDER_STATUSES = ['in_workshop', 'workshop_rejected', 'operations_rejected'] as const;

/** Todas las tareas devueltas para reasignar (lista de la bandeja): incluye las que ya no se pueden resolver. */
export function reassignmentRequestedWhere(companyId: string, hiddenTypeIds: readonly string[]) {
  return repairsWhere('reassignment_requested', companyId, hiddenTypeIds);
}

/**
 * Las devueltas que SÍ se pueden resolver (su pedido sigue en taller): es lo que cuenta el contador del header. La lista
 * muestra también las otras, con «Reasignar» deshabilitado, pero no son una decisión pendiente.
 */
export function resolvableReassignmentWhere(companyId: string, hiddenTypeIds: readonly string[]) {
  const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
  return {
    status: 'reassignment_requested' as const,
    company_id: companyId,
    work_order_items: {
      maintenance_order_items: {
        maintenance_orders: {
          AND: [{ status: { in: [...REASSIGNABLE_ORDER_STATUSES] } }, ...(equipmentCondition ? [equipmentCondition] : [])],
        },
      },
    },
  };
}

function repairsWhere(status: 'pending_approval' | 'reassignment_requested', companyId: string, hiddenTypeIds: readonly string[]) {
  const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
  return {
    status,
    company_id: companyId,
    ...(equipmentCondition
      ? { work_order_items: { maintenance_order_items: { maintenance_orders: equipmentCondition } } }
      : {}),
  };
}

export function pendingValidationWhere(companyId: string, hiddenTypeIds: readonly string[]) {
  const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
  // Va dentro de AND (nunca spreadeado en la raíz): es un OR y podría chocar con otro futuro.
  return {
    status: 'pending_workshop_validation' as const,
    company_id: companyId,
    ...(equipmentCondition ? { AND: [equipmentCondition] } : {}),
  };
}
