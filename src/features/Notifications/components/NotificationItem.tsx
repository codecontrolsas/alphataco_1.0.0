'use client';

import { cn } from '@/lib/utils';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { MyNotification } from '../actions/notifications.server';
import { NOTIFICATION_EVENTS, isNotificationEventKey } from '../notification-catalog';

interface NotificationItemProps {
  item: MyNotification;
  onOpen: (item: MyNotification) => void;
}

/** Una fila de la bandeja: punto de no leído, título, detalle y módulo con fecha. Toda la fila es el botón. */
export function NotificationItem({ item, onOpen }: NotificationItemProps) {
  const moduleLabel = isNotificationEventKey(item.eventKey) ? NOTIFICATION_EVENTS[item.eventKey].moduleLabel : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="hover:bg-accent focus-visible:ring-ring flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left outline-none focus-visible:ring-2"
    >
      <span
        aria-hidden="true"
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.read ? 'bg-transparent' : 'bg-brand')}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm text-pretty', item.read ? 'text-muted-foreground' : 'font-medium')}>
          {item.title}
          {item.read ? null : <span className="sr-only"> (sin leer)</span>}
        </span>
        {item.body ? <span className="text-muted-foreground block truncate text-xs">{item.body}</span> : null}
        <span className="text-muted-foreground block text-xs tabular-nums">
          {moduleLabel ? `${moduleLabel} · ` : ''}
          {formatArgentinaDateTime(item.createdAt)}
        </span>
      </span>
    </button>
  );
}
