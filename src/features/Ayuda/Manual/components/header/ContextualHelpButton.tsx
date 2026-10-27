'use client';

import { Button } from '@/components/ui/button';
import { CircleHelp } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { manualHref } from '../../lib/manual-urls';
import { matchGuide, type RouteRule } from '../../lib/route-table';

/**
 * Abre la guía de la pantalla actual (o la portada del manual si ninguna la documenta) en una
 * pestaña nueva: el manual es una página propia y se lee al lado de la pantalla que explica.
 */
export function ContextualHelpButton({ rules }: { rules: RouteRule[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  const slug = matchGuide(rules, pathname, { tab, subtab: searchParams.get('subtab') });

  return (
    <Button asChild variant="ghost" size="icon" className="!border-0">
      <Link
        href={manualHref(slug ?? undefined)}
        target="_blank"
        rel="noopener"
        aria-label="Ayuda sobre esta pantalla (se abre en una pestaña nueva)"
        title="Ayuda sobre esta pantalla"
      >
        <CircleHelp aria-hidden className="size-[1.2rem]" />
      </Link>
    </Button>
  );
}
