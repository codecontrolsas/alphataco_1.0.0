import type { FitCell } from '../lib/customer-fit';

type CompactIssue = FitCell['b'][number];

/** `YYYY-MM-DD` → `DD/MM/YYYY` sin pasar por `Date` (no corre el día por zona horaria). */
export function formatIsoDay(day: string | null): string {
  if (!day) return '';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/** "Licencia de conducir: vencido el 10/11/2026", "ART: falta cargar", "Psicofísico: vence el 20/11/2026". */
export function issueText(
  issue: CompactIssue,
  typeNames: Record<string, string>,
  kind: 'blocking' | 'expiring'
): string {
  const name = typeNames[issue.t] ?? 'Documento';
  if (kind === 'expiring') return `${name}: vence el ${formatIsoDay(issue.v)}`;
  if (issue.s === 'faltante') return `${name}: falta cargar`;
  if (issue.s === 'rechazado') return `${name}: rechazado`;
  return issue.v ? `${name}: vencido el ${formatIsoDay(issue.v)}` : `${name}: vencido`;
}

/** Texto plano de una celda para el Excel. */
export function cellText(cell: FitCell, typeNames: Record<string, string>): string {
  if (cell.s === 'ok') return 'Cumple';
  if (cell.s === 'expiring') return `Por vencer — ${cell.e.map((i) => issueText(i, typeNames, 'expiring')).join('; ')}`;
  return `No cumple — ${cellIssues(cell, typeNames).join('; ')}`;
}

/** Textos de los problemas de una celda: condición del equipo primero, después documentos. */
export function cellIssues(cell: FitCell, typeNames: Record<string, string>): string[] {
  return [
    ...(cell.o ? [conditionText(cell.o)] : []),
    ...cell.b.map((i) => issueText(i, typeNames, 'blocking')),
    ...cell.e.map((i) => issueText(i, typeNames, 'expiring')),
  ];
}

export function conditionText(condition: string): string {
  return `Equipo ${condition}: no se puede asignar`;
}
