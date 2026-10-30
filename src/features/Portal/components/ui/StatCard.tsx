import { cn } from '@/lib/utils';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

const TONE_CLASSES = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-brand-subtle text-brand-subtle-foreground',
  warn: 'bg-warn-subtle text-warn-subtle-foreground',
  danger: 'bg-danger-subtle text-danger-subtle-foreground',
  ok: 'bg-ok-subtle text-ok-subtle-foreground',
} as const;

/**
 * Indicador del inicio: número grande (lo que importa), etiqueta y una pista. Toda la tarjeta es el enlace a la sección.
 * El tono solo acompaña: el texto (`hint`) dice lo mismo que el color.
 */
export function StatCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  icon: LucideIcon;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <Link
      href={href}
      className="bg-card hover:bg-muted/40 focus-visible:ring-ring group flex min-h-28 flex-col justify-between gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-2 motion-reduce:transition-none"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium text-pretty">{label}</span>
        <span
          aria-hidden="true"
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE_CLASSES[tone])}
        >
          <Icon className="size-4.5" />
        </span>
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-3xl leading-none font-semibold tracking-tight tabular-nums">{value}</span>
          <span className="text-muted-foreground mt-1.5 block text-xs text-pretty">{hint}</span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </span>
    </Link>
  );
}
