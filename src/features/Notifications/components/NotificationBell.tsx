'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MyNotification } from '../actions/notifications.server';
import { useMarkNotificationsRead, useNotificationsList, useUnreadNotificationsCount } from '../hooks/useNotifications';
import { NotificationItem } from './NotificationItem';

const PREVIEW_LIMIT = 10;

const badgeText = (count: number) => (count > 99 ? '99+' : String(count));

/**
 * Campanita del header (#786). El contador se consulta cada minuto; la lista se pide recién al abrir.
 * Abrir un aviso lo marca como leído y lleva a su pantalla.
 */
export function NotificationBell({ companyId, initialUnread }: { companyId: string; initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: unread = 0 } = useUnreadNotificationsCount(companyId, initialUnread);
  const list = useNotificationsList(companyId, { limit: PREVIEW_LIMIT, enabled: open });
  const markRead = useMarkNotificationsRead(companyId);
  const items = list.data?.pages[0]?.items ?? [];

  const label = unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones';

  const openItem = (item: MyNotification) => {
    if (!item.read) markRead.mutate([item.id]);
    setOpen(false);
    if (item.href) router.push(item.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className="focus-visible:ring-ring relative size-10 focus-visible:ring-2"
        >
          <Bell aria-hidden="true" className="size-5" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="bg-destructive text-destructive-foreground absolute top-1 right-1 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold tabular-nums"
            >
              {badgeText(unread)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      {/* Siempre montado: un `role="status"` que aparece y desaparece no se anuncia. */}
      <span role="status" className="sr-only">
        {unread > 0 ? `${unread} notificaciones sin leer` : ''}
      </span>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notificaciones</p>
          {unread > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate('all')}
            >
              Marcar todas como leídas
            </Button>
          ) : null}
        </div>
        <div className="max-h-[min(28rem,60vh)] overflow-y-auto p-1">
          {list.isPending ? (
            <div className="space-y-2 p-2" aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : list.isError ? (
            <div role="alert" className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm">
              <p>No se pudieron cargar las notificaciones.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => list.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">No tenés notificaciones.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationItem item={item} onOpen={openItem} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-1">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/dashboard/notifications" onClick={() => setOpen(false)}>
              Ver todas
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
