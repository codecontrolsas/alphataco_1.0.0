import { notificationCountResponseSchema } from '@/features/MobileApi/contracts/notifications';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileReadJson } from '@/features/MobileApi/lib/http';
import { countUnreadNotifications } from '@/features/MobileApi/notifications/queries.server';

/** Contador de avisos sin leer (el mismo número de la campanita de la web). */
export const GET = mobileRoute({
  module: 'nucleo',
  run: async ({ req, ctx }) =>
    mobileReadJson(req, notificationCountResponseSchema, { unread: await countUnreadNotifications(ctx) }),
});
