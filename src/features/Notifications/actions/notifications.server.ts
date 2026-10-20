'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { NoActiveCompanyError, getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';

const logger = new Logger('features/Notifications/actions');

/**
 * Bandeja personal de avisos (#786). Usuario y empresa salen SIEMPRE de la sesión, nunca del cliente:
 * cada consulta y cada escritura está acotada a las filas propias.
 */
async function owner(): Promise<{ userId: string; companyId: string } | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  try {
    return { userId, companyId: await getActiveCompanyId() };
  } catch (error) {
    // Sin empresa activa (sesión a medio armar): sin bandeja, no un error en el header.
    if (error instanceof NoActiveCompanyError) return null;
    throw error;
  }
}

/** No leídas de la campanita (usa el índice parcial `idx_notification_deliveries_unread`). */
export async function getUnreadNotificationsCount(): Promise<number> {
  try {
    const me = await owner();
    if (!me) return 0;
    return await prisma.notification_deliveries.count({
      where: { user_id: me.userId, company_id: me.companyId, in_app: true, read_at: null },
    });
  } catch (error) {
    // La campanita vive en el header de todas las pantallas: un error acá no puede tirar el layout.
    logger.error('Error al contar los avisos sin leer', { data: { error } });
    return 0;
  }
}

const listSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  onlyUnread: z.boolean().default(false),
});

/** Avisos propios, del más nuevo al más viejo, paginados por cursor. */
export async function getMyNotifications(params: z.input<typeof listSchema> = {}) {
  const me = await owner();
  if (!me) return { items: [], nextCursor: null };
  const { cursor, limit, onlyUnread } = listSchema.parse(params);
  try {
    const rows = await prisma.notification_deliveries.findMany({
      where: { user_id: me.userId, company_id: me.companyId, in_app: true, ...(onlyUnread ? { read_at: null } : {}) },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        read_at: true,
        created_at: true,
        event: { select: { event_key: true, title: true, body: true, href: true } },
      },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        eventKey: row.event.event_key,
        title: row.event.title,
        body: row.event.body,
        href: row.event.href,
        read: row.read_at !== null,
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor: rows.length > limit ? page.at(-1)?.id ?? null : null,
    };
  } catch (error) {
    logger.error('Error al leer los avisos', { data: { error } });
    throw error;
  }
}

export type MyNotificationsPage = Awaited<ReturnType<typeof getMyNotifications>>;
export type MyNotification = MyNotificationsPage['items'][number];

const idsSchema = z.array(z.string().uuid()).min(1).max(100);

/** Marca como leídos avisos propios. Devuelve cuántos cambió. */
export async function markNotificationsRead(ids: string[]): Promise<number> {
  const me = await owner();
  if (!me) return 0;
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return 0;
  const result = await prisma.notification_deliveries.updateMany({
    where: { id: { in: parsed.data }, user_id: me.userId, company_id: me.companyId, read_at: null },
    data: { read_at: new Date() },
  });
  return result.count;
}

export async function markAllNotificationsRead(): Promise<number> {
  const me = await owner();
  if (!me) return 0;
  const result = await prisma.notification_deliveries.updateMany({
    where: { user_id: me.userId, company_id: me.companyId, in_app: true, read_at: null },
    data: { read_at: new Date() },
  });
  return result.count;
}
