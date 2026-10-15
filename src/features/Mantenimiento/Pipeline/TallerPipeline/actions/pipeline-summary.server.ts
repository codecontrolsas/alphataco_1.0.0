'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { ATTENTION_THRESHOLDS } from '../../../lib/attention-thresholds';
import { buildInWorkshopAttentionCondition } from '../../../MaintenanceOrders/table/lib/order-attention';
import { buildOrdersWhere } from '../../../MaintenanceOrders/table/lib/order-where';
import { resolveOrdersScope } from '../../../MaintenanceOrders/table/lib/order-scope';
import {
  CONFIRMED_LIST_STATUS,
  PENDING_LIST_DEFAULT_STATUS,
  confirmedAttentionCondition,
  pendingAttentionCondition,
  resolveOrderListScope,
  scopeConditions,
} from '../../../PedidosMantenimiento/lib/order-list-shared';
import { visibleEquipmentTypeCondition } from '../../../shared/maintenance-resource';
import { getHiddenEquipmentTypeIds } from '../../../utils/equipmentTypeVisibility';
import type { PipelineSummary } from '../../types';

const logger = new Logger('Pipeline/Taller/summary');

const MODULE_SLUG = 'mantenimiento';

/** Contador y aviso de un paso. `count: null` = no se pudo calcular (la cabecera muestra "—", nunca un 0 inventado). */
interface StepSummary {
  count: number | null;
  attention: string | null;
}

const UNKNOWN_STEP: StepSummary = { count: null, attention: null };

/** Cuenta con aislamiento: si la consulta falla se loguea y devuelve `null` en vez de tumbar a todo el paso. */
async function safeCount(label: string, run: () => Promise<number>): Promise<number | null> {
  try {
    return await run();
  } catch (error) {
    logger.error('Error al contar un paso del pipeline de Taller', { data: { error, label } });
    return null;
  }
}

/** Aviso "N …" solo cuando hay algo que atender; `null` si no hay nada o no se pudo contar. */
function attentionText(count: number | null, one: string, many: string): string | null {
  if (count === null || count <= 0) return null;
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * Paso 1 — Por Programar. El contador es el total de la tabla sin filtros: mismo perímetro (empresa, tipos
 * ocultos, supervisor) y mismo estado. La atención usa la misma condición que la tarjeta "Más de 7 días".
 */
async function summarizeSchedule(companyId: string): Promise<StepSummary> {
  if (!(await checkPermissionServer(MODULE_SLUG, 'pedidos_pendientes', 'view'))) return UNKNOWN_STEP;

  const scope = await resolveOrderListScope(companyId);
  const base = [...scopeConditions(scope), { status: PENDING_LIST_DEFAULT_STATUS }];

  const [count, overdue] = await Promise.all([
    safeCount('schedule', () => prisma.maintenance_orders.count({ where: { AND: base } })),
    safeCount('schedule-overdue', () =>
      prisma.maintenance_orders.count({ where: { AND: [...base, pendingAttentionCondition('overdue')] } })
    ),
  ]);

  return {
    count,
    attention: attentionText(
      overdue,
      `espera +${ATTENTION_THRESHOLDS.schedulingPendingDays} días`,
      `esperan +${ATTENTION_THRESHOLDS.schedulingPendingDays} días`
    ),
  };
}

/** Paso 2 — Por Ingresar. Atención: pedidos cuya fecha planificada ya pasó sin registrar el ingreso. */
async function summarizeConfirmed(companyId: string): Promise<StepSummary> {
  if (!(await checkPermissionServer(MODULE_SLUG, 'pedidos_confirmados', 'view'))) return UNKNOWN_STEP;

  const scope = await resolveOrderListScope(companyId);
  const base = [...scopeConditions(scope), { status: CONFIRMED_LIST_STATUS }];

  const [count, pastDate] = await Promise.all([
    safeCount('confirmed', () => prisma.maintenance_orders.count({ where: { AND: base } })),
    safeCount('confirmed-past-date', () =>
      prisma.maintenance_orders.count({ where: { AND: [...base, confirmedAttentionCondition('past_date')] } })
    ),
  ]);

  return { count, attention: attentionText(pastDate, 'con fecha pasada', 'con fecha pasada') };
}

/**
 * Paso 3 — En Taller. Usa el `where` de la tabla sin filtros (el mismo `buildOrdersWhere` que la lista y sus
 * métricas): empresa, tipos ocultos y los estados activos del paso. Atención: ingresaron y no tienen OTs.
 */
async function summarizeInWorkshop(): Promise<StepSummary> {
  const scope = await resolveOrdersScope();
  if (!scope) return UNKNOWN_STEP;

  const base = await buildOrdersWhere(parseSearchParams({}), scope);

  const [count, noWorkOrders] = await Promise.all([
    safeCount('in_workshop', () => prisma.maintenance_orders.count({ where: base })),
    safeCount('in_workshop-no-work-orders', () =>
      prisma.maintenance_orders.count({
        where: { AND: [...base.AND, buildInWorkshopAttentionCondition('no_work_orders')] },
      })
    ),
  ]);

  return { count, attention: attentionText(noWorkOrders, 'sin OTs generadas', 'sin OTs generadas') };
}

/**
 * Paso 4 — Aprobaciones: órdenes pendientes de validación + tareas por autorizar + tareas devueltas para
 * reasignar. Cada parte usa el MISMO `where` que su bloque de la bandeja (empresa y tipos ocultos, sin filtro de
 * supervisor), así el contador coincide con lo que se ve al entrar al paso.
 */
async function summarizeApprovals(companyId: string): Promise<StepSummary> {
  if (!(await checkPermissionServer(MODULE_SLUG, 'bandeja_aprobaciones', 'view'))) return UNKNOWN_STEP;

  const hiddenTypeIds = await getHiddenEquipmentTypeIds();
  const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);

  const repairsWhere = (status: 'pending_approval' | 'reassignment_requested') => ({
    status,
    company_id: companyId,
    ...(equipmentCondition
      ? { work_order_items: { maintenance_order_items: { maintenance_orders: equipmentCondition } } }
      : {}),
  });

  const [validation, authorizations, reassignments] = await Promise.all([
    safeCount('approvals-validation', () =>
      prisma.maintenance_orders.count({
        where: {
          status: 'pending_workshop_validation',
          company_id: companyId,
          ...(equipmentCondition ? { AND: [equipmentCondition] } : {}),
        },
      })
    ),
    safeCount('approvals-authorizations', () =>
      prisma.work_order_item_repairs.count({ where: repairsWhere('pending_approval') })
    ),
    safeCount('approvals-reassignments', () =>
      prisma.work_order_item_repairs.count({ where: repairsWhere('reassignment_requested') })
    ),
  ]);

  // Si una de las tres partes falló el total sería un número inventado: se declara no calculable.
  const parts = [validation, authorizations, reassignments];
  const count = parts.every((part): part is number => part !== null) ? parts.reduce((sum, part) => sum + part, 0) : null;

  return { count, attention: null };
}

/**
 * Resumen de la cabecera del pipeline de Taller: contador y aviso de atención por paso.
 * Es la `queryFn` de React Query del cliente (el servidor la usa también para hidratar).
 *
 * Cada paso se calcula aislado: si uno falla su contador queda `null` ("—") y los demás siguen. Un paso sin
 * permiso de lectura tampoco devuelve datos. Sin `'use cache'`: tiene que reflejar las listas tras cada mutación.
 */
export async function getTallerPipelineSummary(): Promise<PipelineSummary> {
  const steps: Record<string, StepSummary> = {};

  try {
    const companyId = await getActiveCompanyId();

    const entries = [
      ['schedule', () => summarizeSchedule(companyId)],
      ['confirmed', () => summarizeConfirmed(companyId)],
      ['in_workshop', () => summarizeInWorkshop()],
      ['approvals', () => summarizeApprovals(companyId)],
    ] as const;

    const results = await Promise.allSettled(entries.map(([, run]) => run()));
    results.forEach((result, index) => {
      const [stepId] = entries[index];
      if (result.status === 'fulfilled') {
        steps[stepId] = result.value;
      } else {
        logger.error('Error al calcular un paso del pipeline de Taller', { data: { error: result.reason, stepId } });
        steps[stepId] = UNKNOWN_STEP;
      }
    });
  } catch (error) {
    logger.error('Error al resolver el contexto del pipeline de Taller', { data: { error } });
  }

  const stepIds = ['schedule', 'confirmed', 'in_workshop', 'approvals'];
  return {
    counts: Object.fromEntries(stepIds.map((id) => [id, steps[id]?.count ?? null])),
    attention: Object.fromEntries(stepIds.map((id) => [id, steps[id]?.attention ?? null])),
  };
}
