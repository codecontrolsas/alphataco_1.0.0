import type { PortalHseDocument } from '@/features/Portal/actions/hse-documents.queries';
import type { PortalHseNotice } from '@/features/Portal/actions/hse-notices.queries';
import type { PortalHseTraining } from '@/features/Portal/actions/hse-trainings.queries';
import moment from 'moment';

/**
 * Cuentas y listas derivadas de lo que ya traen las consultas del portal (documentos, capacitaciones y avisos). Reglas
 * puras, sin directiva: las usan el inicio, los badges del menú y las listas, así los números coinciden en todas partes.
 */

/** Días hacia adelante que cuentan como "próximo vencimiento". */
export const UPCOMING_WINDOW_DAYS = 60;

/** Capacitación que todavía le pide algo al empleado (rendir, retomar, volver a rendir o firmar la constancia). */
export function trainingNeedsAction(t: PortalHseTraining): boolean {
  return t.status !== 'passed' || t.certificatePending;
}

export function summarizeWork(documents: PortalHseDocument[], trainings: PortalHseTraining[]) {
  const pendingDocuments = documents.filter((d) => d.status === 'pending');
  const actionable = trainings.filter(trainingNeedsAction);
  const toSign = trainings.filter((t) => t.certificatePending);
  // "Sin intentos" no es algo que el empleado pueda resolver solo: se cuenta aparte.
  const blocked = trainings.filter((t) => t.status === 'failed');
  const toTake = actionable.filter((t) => !t.certificatePending && t.status !== 'failed');
  return {
    pendingDocuments,
    toTake,
    toSign,
    blocked,
    /** Lo que muestran los badges del menú. */
    documentsBadge: pendingDocuments.length,
    trainingsBadge: toTake.length + toSign.length,
    total: pendingDocuments.length + toTake.length + toSign.length,
  };
}
export type WorkSummary = ReturnType<typeof summarizeWork>;

export interface UpcomingItem {
  key: string;
  kind: 'training' | 'document';
  title: string;
  /** `YYYY-MM-DD` (día argentino). */
  dueOn: string;
  /** Días que faltan (negativo: ya venció). */
  daysLeft: number;
  href: string;
}

/**
 * Próximos vencimientos: aprobaciones vigentes que vencen dentro de la ventana y los avisos que generó el job
 * `hse-expiry` (vencidos o por vencer). Un mismo ítem aparece una sola vez, con la fecha más cercana.
 */
export function upcomingExpirations(
  trainings: PortalHseTraining[],
  notices: PortalHseNotice[],
  today: string
): UpcomingItem[] {
  const base = moment(today, 'YYYY-MM-DD');
  const byKey = new Map<string, UpcomingItem>();
  const put = (item: UpcomingItem) => {
    const prev = byKey.get(item.key);
    if (!prev || item.dueOn < prev.dueOn) byKey.set(item.key, item);
  };

  for (const t of trainings) {
    if (t.status !== 'passed' || !t.validUntil) continue;
    const daysLeft = moment(t.validUntil, 'YYYY-MM-DD').diff(base, 'days');
    if (daysLeft < 0 || daysLeft > UPCOMING_WINDOW_DAYS) continue;
    put({
      key: `training:${t.trainingId}`,
      kind: 'training',
      title: t.title,
      dueOn: t.validUntil,
      daysLeft,
      href: `/portal/trainings/${t.trainingId}`,
    });
  }
  for (const n of notices) {
    put({
      key: `${n.kind}:${n.itemId}`,
      kind: n.kind === 'training' ? 'training' : 'document',
      title: n.title,
      dueOn: n.dueOn,
      daysLeft: moment(n.dueOn, 'YYYY-MM-DD').diff(base, 'days'),
      href: n.href,
    });
  }
  return [...byKey.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export interface RecentItem {
  key: string;
  kind: 'training' | 'document';
  title: string;
  at: Date;
  outcome: 'accepted' | 'rejected' | 'passed';
  href: string;
}

/** Lo último que el empleado completó (documentos respondidos y capacitaciones aprobadas), lo más nuevo primero. */
export function recentlyCompleted(
  documents: PortalHseDocument[],
  trainings: PortalHseTraining[],
  limit = 5
): RecentItem[] {
  const items: RecentItem[] = [];
  for (const d of documents) {
    if (d.status === 'pending' || !d.respondedAt) continue;
    items.push({
      key: `document:${d.ackId}`,
      kind: 'document',
      title: d.title,
      at: d.respondedAt,
      outcome: d.status,
      href: `/portal/documents/${d.ackId}`,
    });
  }
  for (const t of trainings) {
    if (t.status !== 'passed' || !t.passedAt) continue;
    items.push({
      key: `training:${t.trainingId}`,
      kind: 'training',
      title: t.title,
      at: t.passedAt,
      outcome: 'passed',
      href: `/portal/trainings/${t.trainingId}`,
    });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export { dueLabel } from './due-label';
