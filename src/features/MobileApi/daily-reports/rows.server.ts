import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import moment from 'moment';
import { argentinaDateTime } from '../lib/labels';

/**
 * Campos del contrato de las líneas del parte diario que se agregaron en la revisión 2 (todos opcionales para la app).
 * Solo lectura: no tocan `version` ni los comandos.
 */

export type WorkdayType = '8h' | '12h' | '24h' | 'por_horario';

/** Jornada normalizada a partir del texto guardado (`Jornada 8 horas`, `Jornada 12 horas`, `Jornada 24 horas`, `por horario`). */
export function workdayTypeOf(workingDay: string | null | undefined): WorkdayType | null {
  switch (workingDay?.trim().toLowerCase()) {
    case 'jornada 8 horas':
      return '8h';
    case 'jornada 12 horas':
      return '12h';
    case 'jornada 24 horas':
      return '24h';
    case 'por horario':
      return 'por_horario';
    default:
      return null;
  }
}

const ROLE_KIND: Record<string, { kind: 'chofer' | 'ayudante'; shift: 'dia' | 'noche' }> = {
  chofer_dia: { kind: 'chofer', shift: 'dia' },
  chofer_noche: { kind: 'chofer', shift: 'noche' },
  ayudante_dia: { kind: 'ayudante', shift: 'dia' },
  ayudante_noche: { kind: 'ayudante', shift: 'noche' },
};

/** Rol del empleado en la línea (chofer / ayudante y turno); solo existe en las jornadas de 12 y 24 horas. */
export function roleOf(role: string | null | undefined, workday: WorkdayType | null) {
  if (workday !== '12h' && workday !== '24h') return null;
  return (role && ROLE_KIND[role]) || null;
}

/** Turno de la jornada de 12 h: el guardado o, en filas viejas sin turno, el que sale del personal cargado (igual que el formulario web). */
export function shiftOf(
  workday: WorkdayType | null,
  stored: string | null,
  roles: (string | null)[]
): 'dia' | 'noche' | null {
  if (workday !== '12h') return null;
  if (stored === 'dia' || stored === 'noche') return stored;
  const hasNight = roles.some((role) => role === 'chofer_noche' || role === 'ayudante_noche');
  const hasDay = roles.some((role) => role === 'chofer_dia' || role === 'ayudante_dia');
  return hasNight && !hasDay ? 'noche' : 'dia';
}

/** `@db.Time` → `HH:mm`. Se lee en UTC: la columna guarda la hora de pared, sin zona. */
export const timeOf = (value: Date | null) => (value ? moment.utc(value).format('HH:mm') : null);

export const serviceTypeOf = (value: string | null) =>
  value ? { code: value, label: dailyReportTypeServiceLabels[value] ?? value } : null;

/** Cantidad, historial de cambios y última modificación de cada línea, en dos consultas para toda la página. */
export async function loadChangeHistory(tx: Prisma.TransactionClient, rowIds: string[]) {
  const result = new Map<string, { count: number; lastAt: string; lastBy: string | null }>();
  if (rowIds.length === 0) return result;
  const [counts, lasts] = await Promise.all([
    tx.dailyreportrows_history.groupBy({
      by: ['daily_report_row_id'],
      where: { daily_report_row_id: { in: rowIds } },
      _count: { _all: true },
    }),
    // Último evento de cada línea con su autor (`changed_by` apunta a `profile.credential_id`).
    tx.$queryRaw<{ row_id: string; created_at: Date; author: string | null }[]>`
      SELECT DISTINCT ON (h.daily_report_row_id)
        h.daily_report_row_id::text AS row_id, h.created_at, COALESCE(p.fullname, p.email) AS author
      FROM dailyreportrows_history h
      LEFT JOIN profile p ON p.credential_id = h.changed_by
      WHERE h.daily_report_row_id = ANY(${rowIds}::uuid[])
      ORDER BY h.daily_report_row_id, h.created_at DESC`,
  ]);
  const countById = new Map(counts.map((item) => [item.daily_report_row_id, item._count._all]));
  for (const last of lasts) {
    result.set(last.row_id, {
      count: countById.get(last.row_id) ?? 0,
      lastAt: argentinaDateTime(last.created_at),
      lastBy: last.author,
    });
  }
  return result;
}
