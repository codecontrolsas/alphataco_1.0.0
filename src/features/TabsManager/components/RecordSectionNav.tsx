import { cn } from '@/lib/utils';
import { DisclosureMenu } from '@/shared/components/common/DisclosureMenu';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface RecordSectionNavItem {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  counter?: ReactNode;
  href: string;
}

interface RecordSectionNavProps {
  items: readonly RecordSectionNavItem[];
  activeValue: string;
  ariaLabel: string;
}

/**
 * Índice de una ficha: columna fija a la izquierda desde `lg` (con ícono, nombre y descripción)
 * y selector desplegable debajo. No es una fila de pestañas: cada entrada es un enlace del servidor.
 */
export function RecordSectionNav({ items, activeValue, ariaLabel }: RecordSectionNavProps) {
  const active = items.find((item) => item.value === activeValue) ?? items[0];

  return (
    <>
      <DisclosureMenu
        className="group relative lg:hidden"
        summaryLabel={`${ariaLabel}: ${active.label}`}
        summaryClassName="focus-visible:ring-ring bg-card flex min-h-11 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
        summary={
          <>
            <span className="flex min-w-0 items-center gap-2">
              {active.icon ? (
                <span className="text-muted-foreground shrink-0 [&_svg]:size-4">{active.icon}</span>
              ) : null}
              <b className="min-w-0 truncate font-medium">{active.label}</b>
              {active.counter}
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </>
        }
        panelClassName="bg-popover absolute inset-x-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-lg border p-1 shadow-md"
      >
        <ul>
          {items.map((item) => (
            <li key={item.value}>
              <RecordSectionLink item={item} isActive={item.value === active.value} />
            </li>
          ))}
        </ul>
      </DisclosureMenu>

      <nav aria-label={ariaLabel} className="hidden lg:sticky lg:top-4 lg:block">
        <ul className="bg-card space-y-0.5 rounded-xl border p-1.5">
          {items.map((item) => (
            <li key={item.value}>
              <RecordSectionLink item={item} isActive={item.value === active.value} />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function RecordSectionLink({ item, isActive }: { item: RecordSectionNavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'focus-visible:ring-ring flex min-h-11 items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none focus-visible:ring-2',
        isActive ? 'bg-brand-subtle text-brand-subtle-foreground' : 'hover:bg-accent'
      )}
    >
      {item.icon ? (
        <span
          className={cn(
            'mt-0.5 shrink-0 [&_svg]:size-4',
            isActive ? 'text-brand-subtle-foreground' : 'text-muted-foreground'
          )}
        >
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{item.label}</span>
          {item.counter}
        </span>
        {item.description ? (
          <span className="text-muted-foreground block text-xs leading-snug">{item.description}</span>
        ) : null}
      </span>
    </Link>
  );
}
