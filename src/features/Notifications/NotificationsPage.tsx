import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { Suspense } from 'react';
import { NotificationsInbox } from './NotificationsInbox';
import { getUnreadNotificationsCount } from './actions/notifications.server';

/**
 * Bandeja personal (#786). No pide permiso de pestaña: son los avisos propios, y las acciones ya
 * filtran por el usuario de la sesión y la empresa activa.
 */
export function NotificationsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Notificaciones"
        description="Los avisos que te llegaron en esta empresa, del más nuevo al más viejo."
      />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <NotificationsInboxLoader />
      </Suspense>
    </div>
  );
}

async function NotificationsInboxLoader() {
  const [companyId, initialUnread] = await Promise.all([getActiveCompanyId(), getUnreadNotificationsCount()]);
  return <NotificationsInbox companyId={companyId} initialUnread={initialUnread} />;
}
