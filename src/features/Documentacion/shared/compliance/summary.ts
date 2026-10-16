/**
 * Conteo de las filas de una lista de documentos permanentes de UN recurso (empleado o equipo).
 *
 * Fuente única de la regla "N de M vigentes": la comparten el gemelo del equipo, la cabecera de la ficha
 * del equipo y la del empleado, para que nunca muestren números distintos. Módulo sin directiva ni
 * dependencias de servidor.
 *
 * - M (`applicable`): filas a las que el tipo hoy les aplica (se excluyen las "ya no aplica").
 * - N (`valid`): documentos aprobados (incluidos los que vencen en los próximos 30 días).
 * - Un documento presentado (en revisión) NO es vigente todavía: cuenta aparte como `inReview`.
 */

export interface DocumentRowForSummary {
  isMissing: boolean;
  notApplicable?: boolean;
  state: string | null;
  expiringSoon: boolean;
}

export interface DocumentCounts {
  overdue: number;
  expiringSoon: number;
  missing: number;
  rejected: number;
  inReview: number;
  ok: number;
}

export function countDocumentRows(rows: readonly DocumentRowForSummary[]): DocumentCounts {
  const out: DocumentCounts = { overdue: 0, expiringSoon: 0, missing: 0, rejected: 0, inReview: 0, ok: 0 };
  for (const row of rows) {
    if (row.notApplicable) continue;
    if (row.isMissing) out.missing += 1;
    else if (row.state === 'vencido') out.overdue += 1;
    else if (row.state === 'rechazado') out.rejected += 1;
    else if (row.state === 'presentado') out.inReview += 1;
    else if (row.expiringSoon) out.expiringSoon += 1;
    else out.ok += 1;
  }
  return out;
}

export interface DocumentSummary extends DocumentCounts {
  /** M: documentos que hoy aplican al recurso. */
  applicable: number;
  /** N: documentos vigentes (aprobados, incluidos los que vencen pronto). */
  valid: number;
}

export function summarizeDocumentRows(rows: readonly DocumentRowForSummary[]): DocumentSummary {
  const counts = countDocumentRows(rows);
  const applicable =
    counts.overdue + counts.expiringSoon + counts.missing + counts.rejected + counts.inReview + counts.ok;
  return { ...counts, applicable, valid: counts.ok + counts.expiringSoon };
}
