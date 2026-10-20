import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getUnreadNotificationsCount } from '../actions/notifications.server';
import { NotificationBell } from './NotificationBell';

/** Contador inicial desde el servidor (sin parpadeo) y la empresa activa como parte de la clave de la consulta. */
export async function NotificationBellAsync() {
  const [companyId, initialUnread] = await Promise.all([getActiveCompanyId(), getUnreadNotificationsCount()]);
  return <NotificationBell companyId={companyId} initialUnread={initialUnread} />;
}

/** Mismo lugar y tamaño que la campanita mientras carga. */
export function NotificationBellFallback() {
  return <span aria-hidden="true" className="size-10" />;
}
