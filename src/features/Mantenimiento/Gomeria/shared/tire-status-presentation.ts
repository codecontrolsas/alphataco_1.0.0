import {
  type BadgeVariant,
  type StatusTone,
  type StatusUi,
  TONE_TO_BADGE,
} from '@/features/Mantenimiento/lib/status-presentation';
import {
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Lock,
  PackageCheck,
  PlayCircle,
  Trash2,
  Truck,
  Wrench,
} from 'lucide-react';

/**
 * Fuente única de la presentación de estados de Gomería (cubiertas y órdenes de servicio): etiqueta, tono e
 * ícono. Módulo sin directiva: lo consumen servidor, cliente y los mapas históricos de `tire-mappers`.
 * El estado nunca va solo por color: la pastilla siempre lleva ícono y texto.
 */

export const TIRE_STATUS_UI: Readonly<Record<string, StatusUi>> = {
  INSTALLED: { label: 'Instalada', tone: 'info', icon: Truck },
  AVAILABLE: { label: 'Disponible', tone: 'ok', icon: PackageCheck },
  IN_REPAIR: { label: 'En reparación', tone: 'warn', icon: Wrench },
  MISSING: { label: 'Extraviada', tone: 'danger', icon: CircleHelp },
  DISCARDED: { label: 'Descartada', tone: 'neutral', icon: Trash2 },
};

/** `tire_service_orders.status`: el esquema solo tiene abierta y cerrada (anular revierte y no deja estado propio). */
export const TIRE_SERVICE_ORDER_STATUS_UI: Readonly<Record<string, StatusUi>> = {
  OPEN: { label: 'Abierta', tone: 'warn', icon: PlayCircle },
  CLOSED: { label: 'Cerrada', tone: 'ok', icon: CheckCircle2 },
};

const UNKNOWN: StatusUi = { label: 'Sin estado', tone: 'neutral' satisfies StatusTone, icon: CircleDashed };

export function getTireStatusUi(status: string | null | undefined): StatusUi {
  if (!status) return UNKNOWN;
  return TIRE_STATUS_UI[status] ?? { label: status, tone: 'neutral', icon: CircleDashed };
}

export function getTireServiceOrderStatusUi(status: string | null | undefined): StatusUi {
  if (!status) return UNKNOWN;
  return TIRE_SERVICE_ORDER_STATUS_UI[status] ?? { label: status, tone: 'neutral', icon: Lock };
}

export function toBadgeVariant(tone: StatusTone): BadgeVariant {
  return TONE_TO_BADGE[tone];
}

function labelsOf(table: Readonly<Record<string, StatusUi>>): Record<string, string> {
  return Object.fromEntries(Object.entries(table).map(([key, ui]) => [key, ui.label]));
}

function badgesOf(table: Readonly<Record<string, StatusUi>>): Record<string, BadgeVariant> {
  return Object.fromEntries(Object.entries(table).map(([key, ui]) => [key, TONE_TO_BADGE[ui.tone]]));
}

export const tireStatusLabelsFromUi = labelsOf(TIRE_STATUS_UI);
export const tireStatusBadgesFromUi = badgesOf(TIRE_STATUS_UI);
export const tireServiceOrderStatusLabelsFromUi = labelsOf(TIRE_SERVICE_ORDER_STATUS_UI);
export const tireServiceOrderStatusBadgesFromUi = badgesOf(TIRE_SERVICE_ORDER_STATUS_UI);
