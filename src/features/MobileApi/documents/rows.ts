import { documentStateLabels } from '@/shared/utils/mappers';
import { z } from 'zod';
import type { DocumentListQuery, DocumentResource } from '../contracts/documents';
import moment from 'moment';
import { InvalidCursorError, decodeCursor, encodeCursor, type Tone } from '../lib/labels';

/**
 * Filas de documentos de la API móvil (módulo puro: sin base ni `server-only`). Las filas llegan ya calculadas por el
 * motor de cumplimiento de la web; acá solo se traduce el estado, se busca, se filtra, se ordena y se pagina.
 */

/** Estado de la web (`DocumentRowState`): `pendiente` es la fila FALTANTE (sin documento). */
export type EngineState = 'aprobado' | 'presentado' | 'rechazado' | 'vencido' | 'pendiente';
export type MobileDocumentStatus = 'valid' | 'expiring' | 'expired' | 'missing' | 'rejected';

/** Etiquetas de las listas web (`pendiente` se muestra «Faltante»). */
export const DOCUMENT_STATE_LABELS: Record<string, string> = { ...documentStateLabels, pendiente: 'Faltante' };
export const DOCUMENT_STATE_TONE: Record<string, Tone> = {
  aprobado: 'ok',
  presentado: 'neutral',
  rechazado: 'danger',
  vencido: 'warn',
  pendiente: 'danger',
};

export const DOCUMENT_STATUS_LABELS: Record<MobileDocumentStatus, string> = {
  valid: 'Vigente',
  expiring: 'Por vencer',
  expired: 'Vencido',
  missing: 'Faltante',
  rejected: 'Rechazado',
};

/**
 * Estado de la app a partir del de la web:
 * - `missing`: fila faltante (tipo obligatorio sin documento).
 * - `rejected`: el documento más nuevo está rechazado (la web lo cuenta junto con los faltantes).
 * - `expired`: vencido (fecha pasada o marcado vencido).
 * - `expiring`: aprobado o presentado que vence dentro de 30 días (hora argentina, mismo umbral que la web).
 * - `valid`: aprobado o presentado (presentado = cargado, esperando revisión; la web lo cuenta como cumplido).
 */
export function documentStatus(state: EngineState, expiringSoon: boolean): MobileDocumentStatus {
  switch (state) {
    case 'pendiente':
      return 'missing';
    case 'rechazado':
      return 'rejected';
    case 'vencido':
      return 'expired';
    default:
      return expiringSoon ? 'expiring' : 'valid';
  }
}

export function labeledState(state: string) {
  return { code: state, label: DOCUMENT_STATE_LABELS[state] ?? state, tone: DOCUMENT_STATE_TONE[state] ?? 'neutral' };
}

/** Fila normalizada de cualquiera de las tres clases de recurso. */
export interface MobileDocumentRow {
  id: string;
  isMissing: boolean;
  resource: {
    kind: DocumentResource;
    id: string;
    name: string;
    fileNumber: string | null;
    domain: string | null;
    internNumber: string | null;
  };
  type: { id: string; name: string; mandatory: boolean; monthly: boolean; hasExpiry: boolean; private: boolean };
  state: EngineState;
  status: MobileDocumentStatus;
  validity: string | null;
  period: string | null;
  /** Textos donde busca `q` (ya normalizados). */
  search: string[];
}

/** Minúsculas y sin tildes. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Variantes de búsqueda de un texto: tal cual y sin espacios, puntos ni guiones (patentes "AB 123 CD", "AB-123-CD"). */
export function searchVariants(...values: (string | null | undefined)[]): string[] {
  return values.flatMap((value) => {
    if (!value) return [];
    const text = normalizeText(value);
    const compact = text.replace(/[\s.\-/]/g, '');
    return compact === text ? [text] : [text, compact];
  });
}

/** Cada palabra de `q` tiene que aparecer en alguno de los textos de la fila. */
export function matchesSearch(row: Pick<MobileDocumentRow, 'search'>, q: string | undefined): boolean {
  const words = normalizeText(q ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return true;
  return words.every((word) => {
    const compact = word.replace(/[\s.\-/]/g, '');
    return row.search.some((text) => text.includes(word) || (compact.length > 0 && text.includes(compact)));
  });
}

const STATUS_RANK: Record<MobileDocumentStatus, number> = { missing: 0, rejected: 1, expired: 2, expiring: 3, valid: 4 };
const SEP = '\u0000';

/**
 * Clave de orden: lo que pide acción primero (faltantes, rechazados, vencidos, por vencer, vigentes); dentro de cada
 * grupo, el que vence antes; después tipo, recurso e id (desempate estable). Es también el cursor.
 */
export function sortKey(row: MobileDocumentRow): string {
  return [
    STATUS_RANK[row.status],
    row.validity ?? '9999-12-31',
    normalizeText(row.type.name),
    normalizeText(row.resource.name),
    row.id,
  ].join(SEP);
}

const cursorSchema = z.object({ k: z.string().min(1).max(900) });

/** Filtros de la consulta (salvo `resource`, `period` y `resourceId`, que deciden qué filas se cargan). */
export function filterRows(rows: MobileDocumentRow[], query: Pick<DocumentListQuery, 'status' | 'typeId' | 'q'>) {
  return rows.filter(
    (row) =>
      (!query.status || row.status === query.status) &&
      (!query.typeId || row.type.id === query.typeId) &&
      matchesSearch(row, query.q)
  );
}

/** Página por cursor sobre la clave de orden: sin duplicados ni saltos aunque haya empates en los demás campos. */
export function pageRows(rows: MobileDocumentRow[], query: Pick<DocumentListQuery, 'cursor' | 'limit'>) {
  const cursor = decodeCursor(query.cursor, cursorSchema);
  const keyed = rows.map((row) => ({ row, key: sortKey(row) })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const start = cursor ? keyed.findIndex((item) => item.key > cursor.k) : 0;
  const rest = start < 0 ? [] : keyed.slice(start);
  const page = rest.slice(0, query.limit);
  const last = page.at(-1);
  return {
    page: page.map((item) => item.row),
    nextCursor: rest.length > query.limit && last ? encodeCursor({ k: last.key }) : null,
    total: cursor ? null : keyed.length,
  };
}

/** Fila → ítem del contrato. */
export function toListItem(row: MobileDocumentRow) {
  return {
    id: row.id,
    resource: row.resource,
    type: row.type,
    status: row.status,
    state: labeledState(row.state),
    validity: row.validity,
    period: row.period,
    hasDetail: !row.isMissing,
  };
}

// ─── Resumen y agrupación por vencimiento (revisión 2) ────────────────────────

export function summarize(rows: Pick<MobileDocumentRow, 'status'>[]) {
  const summary = { valid: 0, expiring: 0, expired: 0, missing: 0, rejected: 0, total: rows.length };
  for (const row of rows) summary[row.status] += 1;
  return summary;
}

export type ExpiryBucket = 'overdue' | 'thisWeek' | 'thisMonth' | 'later';

export const EXPIRY_BUCKET_LABELS: Record<ExpiryBucket, string> = {
  overdue: 'Vencidos',
  thisWeek: 'Esta semana',
  thisMonth: 'Este mes',
  later: 'Más adelante',
};

/**
 * Agrupación por vencimiento (`today` = día argentino `YYYY-MM-DD`):
 * - `overdue`: vencido (estado vencido o fecha anterior a hoy).
 * - `thisWeek`: vence hoy o en los próximos 6 días.
 * - `thisMonth`: vence después de esa semana y hasta el último día del mes calendario de hoy.
 * - `later`: vence después.
 * `null` = no entra en ninguna: faltante, o documento sin vencimiento (que no está vencido).
 */
export function expiryBucket(row: Pick<MobileDocumentRow, 'status' | 'validity'>, today: string): ExpiryBucket | null {
  if (row.status === 'missing') return null;
  if (row.status === 'expired') return 'overdue';
  if (!row.validity) return null;
  if (row.validity < today) return 'overdue';
  const weekEnd = moment.utc(today).add(6, 'days').format('YYYY-MM-DD');
  if (row.validity <= weekEnd) return 'thisWeek';
  const monthEnd = moment.utc(today).endOf('month').format('YYYY-MM-DD');
  return row.validity <= monthEnd ? 'thisMonth' : 'later';
}

const bucketCursorSchema = z.object({ b: z.enum(['overdue', 'thisWeek', 'thisMonth', 'later']), k: z.string().min(1).max(900) });

/** Orden dentro de una agrupación: el que vence antes primero; después tipo, recurso e id (desempate estable). */
function bucketKey(row: MobileDocumentRow): string {
  return [row.validity ?? '0000-00-00', normalizeText(row.type.name), normalizeText(row.resource.name), row.id].join(SEP);
}

/** Página de UNA agrupación por cursor. Un cursor de otra agrupación es inválido. */
export function pageBucket(rows: MobileDocumentRow[], bucket: ExpiryBucket, query: Pick<DocumentListQuery, 'cursor' | 'limit'>) {
  const cursor = decodeCursor(query.cursor, bucketCursorSchema);
  if (cursor && cursor.b !== bucket) throw new InvalidCursorError('El cursor es de otra agrupación');
  const keyed = rows.map((row) => ({ row, key: bucketKey(row) })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const start = cursor ? keyed.findIndex((item) => item.key > cursor.k) : 0;
  const rest = start < 0 ? [] : keyed.slice(start);
  const page = rest.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((item) => toListItem(item.row)),
    nextCursor: rest.length > query.limit && last ? encodeCursor({ b: bucket, k: last.key }) : null,
  };
}
