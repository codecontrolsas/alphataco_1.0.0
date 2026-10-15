/**
 * Plan de escritura de una subida de documento (módulo puro).
 *
 * Modelo derivado: la fila existe sólo si hay archivo; no hay filas `pendiente` vacías que
 * "completar". La unidad es `(recurso, tipo, período)`: un tipo mensual admite una fila por período
 * (normalizado `YYYY-MM`), un permanente una sola (período `null`). Para cada recurso pedido:
 * - ya tiene un documento VIGENTE (con archivo, no rechazado, no vencido por fecha argentina o por
 *   estado) → `skipped` (no se pisa: N=1 lo informa como error, el flujo multirrecurso lo ignora);
 * - tiene uno VENCIDO o RECHAZADO → `toRenew` (se actualiza esa fila, misma semántica que renovar);
 * - sólo tiene una fila legacy vacía (sin archivo) → `toFill` (se reutiliza en vez de insertar, para
 *   no dejar basura hasta la migración que las borra);
 * - no tiene nada → `toCreate` (fila nueva).
 */
import { normalizePeriod as normalizeComplianceDate, parseValidity } from '../compliance/dates';

export interface ExistingDocumentRow {
  id: string;
  applies: string | null;
  state: string | null;
  document_path: string | null;
  period: string | null;
  validity: Date | null;
}

export interface PlanWritesOptions {
  /** Período pedido (`YYYY-MM` o `MM/YYYY`); sólo cuenta para tipos mensuales. */
  period: string | undefined | null;
  /** El tipo tiene vencimiento: una validez pasada hace vencido al documento. */
  hasExpiry: boolean;
  /** `YYYY-MM-DD` de hoy en hora argentina (`arToday`). */
  today: string;
}

/** Fila a actualizar: el recurso al que pertenece y su id. */
export interface RowToUpdate {
  applies: string;
  id: string;
}

export interface DocumentWritePlan {
  /** Tenían un documento vencido o rechazado: se actualiza esa fila con el archivo nuevo. */
  toRenew: RowToUpdate[];
  /** Sólo tenían una fila legacy vacía: se reutiliza. */
  toFill: RowToUpdate[];
  /** No tenían nada: se crea una fila. */
  toCreate: string[];
  /** Ya tenían un documento vigente de ese período: no se toca. */
  skipped: string[];
}

/** Período normalizado `YYYY-MM` para comparar y persistir: permanentes (o inválido) → `null`. */
export function normalizePeriod(period: string | undefined | null): string | null {
  return normalizeComplianceDate(period);
}

function hasFile(row: ExistingDocumentRow): boolean {
  return typeof row.document_path === 'string' && row.document_path.trim() !== '';
}

function isExpired(row: ExistingDocumentRow, options: PlanWritesOptions): boolean {
  if (row.state === 'vencido') return true;
  if (!options.hasExpiry) return false;
  const day = parseValidity(row.validity);
  // El día del vencimiento todavía vale.
  return day !== null && day < options.today;
}

function isCurrent(row: ExistingDocumentRow, options: PlanWritesOptions): boolean {
  return hasFile(row) && row.state !== 'rechazado' && !isExpired(row, options);
}

export function planDocumentWrites(
  existing: readonly ExistingDocumentRow[],
  appliesIds: readonly string[],
  options: PlanWritesOptions
): DocumentWritePlan {
  const target = normalizePeriod(options.period);
  const byResource = new Map<string, ExistingDocumentRow[]>();
  for (const row of existing) {
    if (!row.applies || normalizePeriod(row.period) !== target) continue;
    const rows = byResource.get(row.applies) ?? [];
    rows.push(row);
    byResource.set(row.applies, rows);
  }

  const plan: DocumentWritePlan = { toRenew: [], toFill: [], toCreate: [], skipped: [] };
  for (const id of appliesIds) {
    const rows = byResource.get(id) ?? [];
    if (rows.some((row) => isCurrent(row, options))) {
      plan.skipped.push(id);
      continue;
    }
    const withFile = rows.find(hasFile);
    if (withFile) {
      plan.toRenew.push({ applies: id, id: withFile.id });
      continue;
    }
    const empty = rows[0];
    if (empty) plan.toFill.push({ applies: id, id: empty.id });
    else plan.toCreate.push(id);
  }
  return plan;
}
