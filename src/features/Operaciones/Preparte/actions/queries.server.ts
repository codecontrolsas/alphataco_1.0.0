'use server';

import { Logger } from '@/lib/logger';
import { callScalar } from '@/shared/lib/sql';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { preparteCompanyScope } from '../lib/preparte-scope';

const logger = new Logger('features/Operaciones/Preparte/queries');

/**
 * Último número de pedido (`PED-nnnn`) de la empresa activa.
 *
 * `get_max_order_number(p_company_id uuid)` calcula el máximo en Postgres; la empresa
 * viaja SIEMPRE explícita (con `NULL` la función conserva el comportamiento mono-empresa
 * viejo, que acá no queremos).
 */
export async function getLastOrderNumber(): Promise<string> {
  try {
    const companyId = await getActiveCompanyId();
    const value = await callScalar('get_max_order_number', [{ uuid: companyId }], z.string().nullable());
    return value ?? 'PED-0000';
  } catch (error) {
    logger.error('Error al obtener el último número de pedido', { data: { error } });
    return 'PED-0000';
  }
}

/** Select común del historial de cambios, con el nombre de quien hizo el cambio. */
const CHANGE_LOG_INCLUDE = {
  profile: { select: { credential_id: true, fullname: true } },
} as const;

type ChangeLogRow = {
  id: string;
  preparte_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  changed_by: string | null;
  changed_at: Date;
  metadata: unknown;
  profile: { credential_id: string | null; fullname: string | null } | null;
};

/** Aplana el `profile` del join en `changed_by_name` (lo que muestra el detalle del pedido). */
function toChangeLogEntry(log: ChangeLogRow) {
  return {
    id: log.id,
    preparte_id: log.preparte_id,
    field_name: log.field_name,
    old_value: log.old_value,
    new_value: log.new_value,
    reason: log.reason,
    changed_by: log.changed_by,
    changed_at: log.changed_at,
    metadata: (log.metadata ?? null) as Record<string, unknown> | null,
    changed_by_name: log.profile?.fullname || null,
  };
}

/**
 * Historial de cambios de un pedido.
 *
 * Perímetro: el pedido tiene que ser de la empresa activa (los pedidos viejos sin
 * `company_id` siguen siendo visibles, igual que en el resto del módulo).
 */
export async function getPreparteChangeLogs(preparteId: string) {
  try {
    const companyId = await getActiveCompanyId();

    const data = await prisma.preparte_change_logs.findMany({
      where: {
        preparte_id: preparteId,
        preparte: preparteCompanyScope(companyId),
      },
      include: CHANGE_LOG_INCLUDE,
      orderBy: { changed_at: 'desc' },
    });

    return data.map(toChangeLogEntry);
  } catch (error) {
    logger.error('Error al obtener el historial de cambios del pedido', { data: { error, preparteId } });
    throw new Error('Error al obtener el historial de cambios');
  }
}

/**
 * Historial de cambios de todas las líneas que comparten el mismo `numero_pedido`.
 *
 * Perímetro: sólo pedidos de la empresa activa.
 */
export async function getPreparteChangeLogsByOrderNumber(numeroPedido: string) {
  try {
    const companyId = await getActiveCompanyId();

    const data = await prisma.preparte_change_logs.findMany({
      where: {
        preparte: {
          numero_pedido: numeroPedido,
          ...preparteCompanyScope(companyId),
        },
      },
      include: CHANGE_LOG_INCLUDE,
      orderBy: { changed_at: 'desc' },
    });

    return data.map(toChangeLogEntry);
  } catch (error) {
    logger.error('Error al obtener el historial por número de pedido', { data: { error, numeroPedido } });
    throw new Error('Error al obtener el historial de cambios');
  }
}
