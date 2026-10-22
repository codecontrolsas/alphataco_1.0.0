'use server';

import { NOTIFICATION_EVENT_KEYS, type NotificationChannel } from '@/features/Notifications/notification-catalog';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { z } from 'zod';

const logger = new Logger('features/UserPermissionsManager/roleNotifications');

const pairSchema = z.object({
  eventKey: z.enum(NOTIFICATION_EVENT_KEYS as [string, ...string[]]),
  channel: z.enum(['in_app', 'email']),
});
const changesSchema = z.object({
  add: z.array(pairSchema).max(200),
  remove: z.array(pairSchema).max(200),
});

export type RoleNotificationPair = { eventKey: string; channel: NotificationChannel };
export type RoleNotificationChanges = { add: RoleNotificationPair[]; remove: RoleNotificationPair[] };

class RoleNotificationsError extends Error {}

/** Avisos y canales activos de un rol (baseline del editor). */
export async function getRoleNotificationSettings(roleId: number): Promise<RoleNotificationPair[]> {
  if (!Number.isSafeInteger(roleId)) throw new RoleNotificationsError('Rol no válido');
  const [allowed, rows] = await Promise.all([
    checkPermissionServer('configuracion', 'gestion-roles', 'view'),
    prisma.role_notifications.findMany({
      where: { role_id: BigInt(roleId) },
      select: { event_key: true, channel: true },
    }),
  ]);
  if (!allowed) throw new RoleNotificationsError('No tienes permisos para ver la configuración de roles');
  return rows.map((row) => ({ eventKey: row.event_key, channel: row.channel }));
}

/**
 * Altas y bajas EXPLÍCITAS de avisos de un rol (nunca reemplazo total). Admite roles de sistema:
 * en ellos los permisos siguen bloqueados, pero los avisos se pueden configurar (#786).
 * Devuelve lo que realmente cambió.
 */
export async function updateRoleNotifications(roleId: number, changes: RoleNotificationChanges) {
  const parsed = changesSchema.safeParse(changes);
  if (!Number.isSafeInteger(roleId) || !parsed.success) {
    throw new RoleNotificationsError('Los avisos enviados no son válidos');
  }
  if (!(await checkPermissionServer('configuracion', 'gestion-roles', 'update'))) {
    throw new RoleNotificationsError('No tienes permisos para modificar los avisos del rol');
  }
  const key = (pair: z.infer<typeof pairSchema>) => `${pair.eventKey}:${pair.channel}`;
  const removeKeys = new Set(parsed.data.remove.map(key));
  if (parsed.data.add.some((pair) => removeKeys.has(key(pair)))) {
    throw new RoleNotificationsError('Un aviso no puede activarse y desactivarse a la vez');
  }
  if (parsed.data.add.length === 0 && parsed.data.remove.length === 0) return { added: 0, removed: 0 };

  try {
    return await prisma.$transaction(async (tx) => {
      const role = await tx.roles.findUnique({ where: { id: BigInt(roleId) }, select: { id: true } });
      if (!role) throw new RoleNotificationsError('El rol no existe');
      const created =
        parsed.data.add.length > 0
          ? await tx.role_notifications.createMany({
              data: parsed.data.add.map((pair) => ({
                role_id: BigInt(roleId),
                event_key: pair.eventKey,
                channel: pair.channel,
              })),
              skipDuplicates: true,
            })
          : { count: 0 };
      const deleted =
        parsed.data.remove.length > 0
          ? await tx.role_notifications.deleteMany({
              where: {
                role_id: BigInt(roleId),
                OR: parsed.data.remove.map((pair) => ({ event_key: pair.eventKey, channel: pair.channel })),
              },
            })
          : { count: 0 };
      return { added: created.count, removed: deleted.count };
    });
  } catch (error) {
    logger.error('Error al actualizar los avisos del rol', { data: { error, roleId } });
    if (error instanceof RoleNotificationsError) throw error;
    throw new Error('No se pudieron guardar los avisos del rol');
  }
}
