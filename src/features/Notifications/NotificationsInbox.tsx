'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MyNotification } from './actions/notifications.server';
import { NotificationItem } from './components/NotificationItem';
import { useMarkNotificationsRead, useNotificationsList, useUnreadNotificationsCount } from './hooks/useNotifications';

const FILTERS = [
  { value: false, label: 'Todas' },
  { value: true, label: 'Sin leer' },
] as const;

/** Bandeja completa de avisos del usuario en la empresa activa, de a 20 con «Cargar más». */
export function NotificationsInbox({ companyId, initialUnread }: { companyId: string; initialUnread: number }) {
  const router = useRouter();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { data: unread = 0 } = useUnreadNotificationsCount(companyId, initialUnread);
  const list = useNotificationsList(companyId, { onlyUnread });
  const markRead = useMarkNotificationsRead(companyId);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  const openItem = (item: MyNotification) => {
    if (!item.read) markRead.mutate([item.id]);
    if (item.href) router.push(item.href);
  };

  return (
    <section className="bg-card rounded-xl border">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div role="group" aria-label="Filtrar avisos" className="bg-muted inline-flex rounded-md p-0.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              aria-pressed={onlyUnread === filter.value}
              onClick={() => setOnlyUnread(filter.value)}
              className={cn(
                'focus-visible:ring-ring min-h-9 rounded px-3 text-sm outline-none focus-visible:ring-2',
                onlyUnread === filter.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'
              )}
            >
              {filter.label}
              {filter.value ? <span className="tabular-nums"> ({unread})</span> : null}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={unread === 0 || markRead.isPending}
          onClick={() => markRead.mutate('all')}
        >
          Marcar todas como leídas
        </Button>
      </header>

      <div className="p-2">
        {list.isPending ? (
          <div className="space-y-2 p-2" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <StateBlock
            variant="error"
            title="No se pudieron cargar las notificaciones"
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => list.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <StateBlock
            variant="empty"
            title={onlyUnread ? 'No tenés avisos sin leer' : 'No tenés notificaciones'}
            description="Los avisos que te llegan dependen de la configuración de tu rol."
          />
        ) : (
          <>
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationItem item={item} onOpen={openItem} />
                </li>
              ))}
            </ul>
            {list.hasNextPage ? (
              <div className="flex justify-center p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={list.isFetchingNextPage}
                  onClick={() => list.fetchNextPage()}
                >
                  {list.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
