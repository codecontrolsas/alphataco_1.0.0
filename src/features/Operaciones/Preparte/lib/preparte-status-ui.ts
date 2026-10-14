import type { BadgeProps } from '@/components/ui/badge';
import type { MetricTone } from '@/shared/components/common/MetricCard';
import { Ban, CheckCircle2, Clock, RefreshCw, TimerOff, XCircle, type LucideIcon } from 'lucide-react';
import type { PreparteStatus } from './preparte-status';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

interface PreparteStatusUi {
  /** Rótulo del estado (badge, filtro, export). */
  label: string;
  /** Rótulo en plural de la tarjeta de métricas. */
  metricLabel: string;
  /** Línea de apoyo de la tarjeta de métricas. */
  hint: string;
  icon: LucideIcon;
  variant: BadgeVariant;
  tone: MetricTone;
}

/**
 * Presentación de cada estado del pedido. Única fuente de label, ícono y color: la usan el badge de
 * la tabla, el filtro, las tarjetas de métricas y el detalle, para que un estado se vea igual en todos lados.
 */
export const PREPARTE_STATUS_UI: Record<PreparteStatus, PreparteStatusUi> = {
  pendiente: {
    label: 'Pendiente',
    metricLabel: 'Pendientes',
    hint: 'Esperan confirmación',
    icon: Clock,
    variant: 'pending',
    tone: 'brand',
  },
  reprogramado: {
    label: 'Reprogramado',
    metricLabel: 'Reprogramados',
    hint: 'Con fecha nueva',
    icon: RefreshCw,
    variant: 'warning',
    tone: 'warn',
  },
  confirmado: {
    label: 'Confirmado',
    metricLabel: 'Confirmados',
    hint: 'Enviados al parte',
    icon: CheckCircle2,
    variant: 'success',
    tone: 'default',
  },
  vencido: {
    label: 'Vencido',
    metricLabel: 'Vencidos',
    hint: 'Pasó la fecha sin confirmar',
    icon: TimerOff,
    variant: 'destructive',
    tone: 'danger',
  },
  rechazado: {
    label: 'Rechazado',
    metricLabel: 'Rechazados',
    hint: 'No aceptados',
    icon: XCircle,
    variant: 'destructive',
    tone: 'default',
  },
  cancelado: {
    label: 'Cancelado',
    metricLabel: 'Cancelados',
    hint: 'Quedaron sin efecto',
    icon: Ban,
    variant: 'secondary',
    tone: 'default',
  },
};

/** Orden de las tarjetas de métricas: primero lo que pide acción. */
export const PREPARTE_METRIC_ORDER: readonly PreparteStatus[] = [
  'pendiente',
  'vencido',
  'reprogramado',
  'confirmado',
  'rechazado',
  'cancelado',
];

export const PREPARTE_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PREPARTE_STATUS_UI).map(([status, ui]) => [status, ui.label])
);
