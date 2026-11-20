'use client';

import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { getInboxCount } from '../actions/inbox.server';

export const INBOX_COUNT_QUERY_KEY = ['maintenance', 'inbox-count'] as const;

const badgeText = (count: number) => (count > 99 ? '99+' : String(count));

/**
 * Ícono de Mi bandeja en el header, al lado de la campana (la campana es para avisos; la bandeja, para decisiones).
 * El contador cuenta solo DECISIONES, con los mismos `where` que la lista, y se refresca cada minuto y tras cada
 * acción de mantenimiento (comparte el prefijo `['maintenance']` de `invalidateAllMaintenanceQueries`).
 */
export function InboxBell({ companyId, initialCount }: { companyId: string; initialCount: number | null }) {
  const { data: count = null } = useQuery({
    queryKey: [...INBOX_COUNT_QUERY_KEY, companyId],
    queryFn: () => getInboxCount(),
    initialData: initialCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const label = count === null ? 'Mi bandeja' : `Mi bandeja, ${count} ${count === 1 ? 'pendiente' : 'pendientes'}`;

  return (
    <Button asChild type="button" variant="ghost" size="icon" className="relative size-10">
      <Link href="/dashboard/inbox" aria-label={label} title="Mi bandeja">
        <Inbox aria-hidden="true" className="size-5" />
        {count !== null && count > 0 ? (
          <span
            aria-hidden="true"
            className="bg-brand text-brand-foreground absolute top-1 right-1 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold tabular-nums"
          >
            {badgeText(count)}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
