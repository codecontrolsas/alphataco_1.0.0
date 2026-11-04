import {
  notificationListQuerySchema,
  notificationListResponseSchema,
} from '@/features/MobileApi/contracts/notifications';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { InvalidCursorError } from '@/features/MobileApi/lib/labels';
import { listNotifications } from '@/features/MobileApi/notifications/queries.server';

/**
 * Avisos del usuario (la campanita de la web), del más nuevo al más viejo, paginados por cursor. Cada aviso trae `day`
 * (día argentino) para agrupar y `unread` (estado de lectura real). Sin permiso propio: son los del usuario.
 */
export const GET = mobileRoute({
  module: 'nucleo',
  run: async ({ req, ctx }) => {
    const parsed = notificationListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return mobileError(422, 'INVALID_INPUT', `Parámetros inválidos: ${parsed.error.issues[0]?.path.join('.') ?? ''}`);
    }
    try {
      return mobileReadJson(req, notificationListResponseSchema, await listNotifications(ctx, parsed.data));
    } catch (error) {
      if (error instanceof InvalidCursorError)
        return mobileError(422, 'INVALID_INPUT', 'El cursor no es válido: volvé a la primera página.');
      throw error;
    }
  },
});
