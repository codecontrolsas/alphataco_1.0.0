import {
  TONE_TO_BADGE,
  type BadgeVariant,
  type StatusTone,
  type StatusUi,
} from '@/features/Mantenimiento/lib/status-presentation';
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  Hourglass,
  Loader,
  Lock,
  Tag,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';

/**
 * Presentación de los estados de ticket (etiqueta, tono e ícono). El color sale del tono, que
 * resuelve a los tokens de `globals.css` (claro y oscuro). Las clases van ESCRITAS COMPLETAS:
 * Tailwind v4 solo genera las que encuentra literales en el código.
 */
export const STATUS_BY_SLUG: Record<string, StatusUi> = {
  open: { label: 'Abierto', tone: 'info', icon: CircleDot },
  pendiente_aprobacion: { label: 'Esperando tu aprobación', tone: 'warn', icon: Clock },
  aprobado_cliente: { label: 'Aprobado por vos', tone: 'ok', icon: ThumbsUp },
  in_progress: { label: 'En curso', tone: 'brand', icon: Loader },
  blocked: { label: 'Frenado', tone: 'danger', icon: Lock },
  planned: { label: 'Planificado', tone: 'pending', icon: CalendarClock },
  valued: { label: 'Valorizado', tone: 'pending', icon: Tag },
  pending_planning: { label: 'Pendiente de planificación', tone: 'neutral', icon: Hourglass },
  resolved: { label: 'Resuelto', tone: 'ok', icon: CheckCircle2 },
  done: { label: 'Resuelto', tone: 'ok', icon: CheckCircle2 },
  closed: { label: 'Cerrado', tone: 'neutral', icon: Ban },
  cancelled: { label: 'Cancelado', tone: 'neutral', icon: Ban },
};

/** Clases derivadas del tono (borde lateral, punto y degradé de la tarjeta). */
const TONE_CLASSES: Record<StatusTone, { borderClass: string; dotClass: string; tintClass: string }> = {
  neutral: {
    borderClass: 'border-l-muted-foreground',
    dotClass: 'bg-muted-foreground',
    tintClass: 'from-muted-foreground/10',
  },
  pending: { borderClass: 'border-l-pending', dotClass: 'bg-pending', tintClass: 'from-pending/10' },
  warn: { borderClass: 'border-l-warn', dotClass: 'bg-warn', tintClass: 'from-warn/10' },
  brand: { borderClass: 'border-l-brand', dotClass: 'bg-brand', tintClass: 'from-brand/10' },
  info: { borderClass: 'border-l-info', dotClass: 'bg-info', tintClass: 'from-info/10' },
  ok: { borderClass: 'border-l-ok', dotClass: 'bg-ok', tintClass: 'from-ok/10' },
  danger: { borderClass: 'border-l-danger', dotClass: 'bg-danger', tintClass: 'from-danger/10' },
};

export interface TicketStatusPresentation extends StatusUi {
  badgeVariant: BadgeVariant;
  borderClass: string;
  dotClass: string;
  tintClass: string;
  icon: LucideIcon;
}

/**
 * Estado que se muestra cuando el slug no está en la tabla.
 *
 * NO cae al nombre crudo del estado a propósito. Los estados son datos
 * editables desde Admin: el día que el equipo crea "Revisión en Dev" o
 * "Esperando QA", el fallback anterior se lo mostraba al cliente tal cual, con
 * la jerga interna incluida. El backend ya reemplaza los estados internos por
 * la última parada visible antes de responder; esto es la segunda red, para
 * que ni un slug inesperado ni un backend viejo puedan filtrar un nombre
 * interno.
 */
const UNKNOWN_STATUS: StatusUi = { label: 'En curso', tone: 'brand', icon: Loader };

export function statusFor(slug: string | undefined): TicketStatusPresentation {
  const ui = slug && STATUS_BY_SLUG[slug] ? STATUS_BY_SLUG[slug] : UNKNOWN_STATUS;
  return { ...ui, badgeVariant: TONE_TO_BADGE[ui.tone], ...TONE_CLASSES[ui.tone] };
}
