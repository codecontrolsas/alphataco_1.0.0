'use client';

import { badgeLabel, type PortalBadgeCounts, type PortalBadgeKey } from '@/features/Portal/navigation/registry';
import { cn } from '@/lib/utils';
import { use } from 'react';

/**
 * Contador de pendientes de una sección. Lee la promesa que arrancó el servidor (no bloquea el menú: va dentro de un
 * `Suspense` con fallback vacío). El número es visible y su texto ("2 pendientes") está en el nombre accesible del
 * enlace, así no depende del color.
 */
export function NavBadge({
  counts,
  badgeKey,
  variant,
}: {
  counts: Promise<PortalBadgeCounts>;
  badgeKey: PortalBadgeKey;
  variant: 'sidebar' | 'bottom';
}) {
  const count = use(counts)[badgeKey] ?? 0;
  if (count <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'bg-brand text-brand-foreground inline-flex items-center justify-center rounded-full font-semibold tabular-nums',
          variant === 'sidebar'
            ? 'ml-auto h-5 min-w-5 px-1.5 text-xs group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:size-2 group-data-[collapsible=icon]:min-w-0 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:text-[0px]'
            : 'ring-background absolute top-1.5 left-1/2 ml-2 h-4.5 ring-2 min-w-4.5 px-1 text-[0.6875rem]'
        )}
      >
        {count > 99 ? '99+' : count}
      </span>
      <span className="sr-only">{badgeLabel(count)}</span>
    </>
  );
}
