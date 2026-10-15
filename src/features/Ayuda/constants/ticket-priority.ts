import {
  TONE_TO_BADGE,
  type BadgeVariant,
  type StatusTone,
  type StatusUi,
} from '@/features/Mantenimiento/lib/status-presentation';
import type { TicketPriority } from '@/shared/lib/taskapp/types';
import { ArrowDown, ArrowUp, Equal, Flame, type LucideIcon } from 'lucide-react';

export type PrioritySlug = TicketPriority;

/** Color del ícono por tono (clases completas, sobre tokens de `globals.css`). */
const ICON_CLASS_BY_TONE: Partial<Record<StatusTone, string>> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  warn: 'text-warn',
  danger: 'text-danger',
};

export interface PriorityDef extends StatusUi {
  slug: PrioritySlug;
  icon: LucideIcon;
  badgeVariant: BadgeVariant;
  iconClass: string;
}

const PRIORITY_UI: Record<PrioritySlug, StatusUi> = {
  low: { label: 'Baja', tone: 'neutral', icon: ArrowDown },
  medium: { label: 'Media', tone: 'info', icon: Equal },
  high: { label: 'Alta', tone: 'warn', icon: ArrowUp },
  critical: { label: 'Crítica', tone: 'danger', icon: Flame },
};

export const PRIORITY_BY_SLUG: Record<PrioritySlug, PriorityDef> = Object.fromEntries(
  (Object.keys(PRIORITY_UI) as PrioritySlug[]).map((slug) => {
    const ui = PRIORITY_UI[slug];
    return [
      slug,
      {
        ...ui,
        slug,
        badgeVariant: TONE_TO_BADGE[ui.tone],
        iconClass: ICON_CLASS_BY_TONE[ui.tone] ?? 'text-muted-foreground',
      },
    ];
  })
) as Record<PrioritySlug, PriorityDef>;

export const PRIORITIES: PriorityDef[] = Object.values(PRIORITY_BY_SLUG);

export function priorityFor(slug: string | undefined): PriorityDef {
  if (slug && slug in PRIORITY_BY_SLUG) return PRIORITY_BY_SLUG[slug as PrioritySlug];
  return PRIORITY_BY_SLUG.medium;
}
