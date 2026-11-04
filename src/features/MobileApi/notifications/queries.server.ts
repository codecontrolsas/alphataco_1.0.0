import 'server-only';

import { NOTIFICATION_EVENTS } from '@/features/Notifications/notification-catalog';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext, type TenantContext } from '@/shared/lib/tenant-context';
import { z } from 'zod';
import type { NotificationListQuery } from '../contracts/notifications';
import { InvalidCursorError, argentinaDateTime } from '../lib/labels';

/**
 * Avisos del usuario de la petición. Misma fuente y mismo criterio que la campanita de la web
 * (`getMyNotifications` / `getUnreadNotificationsCount`): las entregas EN LA APP (`in_app`) del usuario en la empresa
 * activa, del más nuevo al más viejo; un aviso está sin leer mientras `read_at` sea null. El estado de lectura es real,
 * por eso viaja `unread`. Solo lectura.
 */

const uuid = z.string().uuid();

/** Eventos del catálogo que tienen una pantalla equivalente en la app, por módulo del evento. */
const MODULE_TARGET: Record<string, string> = { documentacion: 'documents', hse: 'trainings' };

const DAILY_REPORT_HREF = /^\/dashboard\/operations\/([0-9a-f-]{36})$/i;

/** De dónde sale el destino: parte diario por la ruta del aviso; módulo por el módulo del evento; si no, ninguno. */
export function targetOf(eventKey: string, href: string | null) {
  const report = href ? DAILY_REPORT_HREF.exec(href) : null;
  if (report && uuid.safeParse(report[1]).success) return { type: 'daily-report' as const, id: report[1] };
  const definition = (NOTIFICATION_EVENTS as Record<string, { module: string } | undefined>)[eventKey];
  const moduleTarget = definition ? MODULE_TARGET[definition.module] : undefined;
  // Los avisos de HSE sobre documentos no tienen pantalla en la app: solo los de capacitaciones.
  if (moduleTarget && eventKey !== 'hse.document_rejected') return { type: 'module' as const, id: moduleTarget };
  return null;
}

const unreadWhere = (ctx: TenantContext) => ({
  user_id: ctx.userId as string,
  company_id: ctx.companyId,
  in_app: true,
  read_at: null,
});

export async function countUnreadNotifications(ctx: TenantContext): Promise<number> {
  return runWithTenantContext(prismaBase, ctx, (tx) => tx.notification_deliveries.count({ where: unreadWhere(ctx) }));
}

export async function listNotifications(ctx: TenantContext, query: NotificationListQuery) {
  if (query.cursor && !uuid.safeParse(query.cursor).success) throw new InvalidCursorError('Cursor inválido');
  const userId = ctx.userId as string;

  return runWithTenantContext(prismaBase, ctx, async (tx) => {
    const [rows, unreadCount] = await Promise.all([
      tx.notification_deliveries.findMany({
        where: { user_id: userId, company_id: ctx.companyId, in_app: true, ...(query.unread ? { read_at: null } : {}) },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          read_at: true,
          created_at: true,
          event: { select: { event_key: true, title: true, body: true, href: true } },
        },
      }),
      query.cursor ? Promise.resolve(null) : tx.notification_deliveries.count({ where: unreadWhere(ctx) }),
    ]);

    const page = rows.slice(0, query.limit);
    const definitions = NOTIFICATION_EVENTS as Record<string, { moduleLabel: string } | undefined>;
    return {
      items: page.map((row) => ({
        id: row.id,
        kind: row.event.event_key,
        module: definitions[row.event.event_key]?.moduleLabel ?? null,
        title: row.event.title,
        body: row.event.body,
        at: argentinaDateTime(row.created_at),
        day: argentinaDate(row.created_at),
        unread: row.read_at === null,
        target: targetOf(row.event.event_key, row.event.href),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      unreadCount,
    };
  });
}
