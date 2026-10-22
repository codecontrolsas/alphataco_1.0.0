'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { preparteCompanyScope } from '../lib/preparte-scope';

const logger = new Logger('features/Operaciones/Preparte/queries');

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
