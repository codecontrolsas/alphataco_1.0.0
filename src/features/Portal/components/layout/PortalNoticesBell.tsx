'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { dueLabel } from '@/features/Portal/lib/due-label';
import { cn } from '@/lib/utils';
import { Bell, ChevronRight, FileText, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export interface BellNotice {
  id: string;
  kind: 'training' | 'document';
  title: string;
  /** Fecha ya formateada (DD/MM/YYYY). */
  dueText: string;
  daysLeft: number;
  href: string;
}

/**
 * Avisos del portal en la cabecera: los avisos de vencimiento que genera el job `hse-expiry` (los mismos del inicio).
 * El número es visible y está en el nombre accesible; vencido o por vencer se dice con texto, no solo con color.
 */
export function PortalNoticesBell({ notices }: { notices: BellNotice[] }) {
  const [open, setOpen] = useState(false);
  const count = notices.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-11 md:size-10"
          aria-label={
            count === 0 ? 'Avisos: no tenés avisos' : `Avisos: ${count === 1 ? '1 aviso' : `${count} avisos`}`
          }
        >
          <Bell aria-hidden="true" className="size-[1.15rem]" />
          {count > 0 && (
            <span
              aria-hidden="true"
              className="bg-brand text-brand-foreground ring-background absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold tabular-nums ring-2"
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Avisos de vencimiento</p>
          <p className="text-muted-foreground text-xs">Últimos 60 días</p>
        </div>
        {count === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm text-pretty">
            No tenés avisos. Cuando una capacitación o un documento esté por vencer, te avisamos acá.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {notices.map((n) => {
              const Icon = n.kind === 'training' ? GraduationCap : FileText;
              const expired = n.daysLeft < 0;
              return (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="hover:bg-muted/50 focus-visible:ring-ring flex min-h-14 items-start gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  >
                    <Icon aria-hidden="true" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block text-sm font-medium break-words">{n.title}</span>
                      <span
                        className={cn(
                          'block text-xs tabular-nums',
                          expired ? 'text-danger-subtle-foreground' : 'text-warn-subtle-foreground'
                        )}
                      >
                        {n.kind === 'training' ? 'Capacitación' : 'Documento'} · {dueLabel(n.daysLeft)} ({n.dueText})
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Mientras se leen los avisos: la campana sin número (no salta el layout). */
export function PortalNoticesBellFallback() {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-11 md:size-10" disabled aria-label="Avisos">
      <Bell aria-hidden="true" className="size-[1.15rem]" />
    </Button>
  );
}
