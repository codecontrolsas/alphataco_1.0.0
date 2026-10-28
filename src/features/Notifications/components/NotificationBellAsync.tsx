import { NoActiveCompanyError, getActiveCompanyId } from '@/shared/lib/tenant';
import { getUnreadNotificationsCount } from '../actions/notifications.server';
import { NotificationBell } from './NotificationBell';

/** Empresa activa o null: sin empresa (primer ingreso, en el alta de la primera empresa) no hay avisos que mostrar. */
async function activeCompanyOrNull(): Promise<string | null> {
  try {
    return await getActiveCompanyId();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) return null;
    throw error;
  }
}

/**
 * Contador inicial desde el servidor (sin parpadeo) y la empresa activa como parte de la clave de la consulta.
 * La campanita vive en el header de todo el dashboard: sin empresa activa no se muestra, en vez de romper el layout
 * de `/dashboard/configuration/companies/new`, que es justo donde el proxy manda a quien todavía no tiene empresa.
 */
export async function NotificationBellAsync() {
  const [companyId, initialUnread] = await Promise.all([activeCompanyOrNull(), getUnreadNotificationsCount()]);
  if (!companyId) return null;
  return <NotificationBell companyId={companyId} initialUnread={initialUnread} />;
}

/** Mismo lugar y tamaño que la campanita mientras carga. */
export function NotificationBellFallback() {
  return <span aria-hidden="true" className="size-10" />;
}
