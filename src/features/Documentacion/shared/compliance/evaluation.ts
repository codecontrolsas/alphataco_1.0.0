import { EXPIRING_SOON_DAYS } from '@/features/Documentacion/shared/lib/document-expiry';
import { typeAppliesTo } from './applicability';
import { daysUntil, normalizePeriod } from './dates';
import { aggregateStatus } from './status';
import type {
  ComplianceDoc,
  ComplianceResource,
  ComplianceType,
  DocumentState,
  EvaluateOptions,
  EvaluatedRequirement,
  ResourceEvaluation,
} from './types';

/** Sólo cuenta como documento una fila con archivo (una fila vacía legacy se ignora). */
function hasFile(doc: ComplianceDoc): boolean {
  return typeof doc.path === 'string' && doc.path.trim() !== '';
}

function isRejected(doc: ComplianceDoc): boolean {
  return doc.storedState === 'rechazado';
}

function newestFirst(a: ComplianceDoc, b: ComplianceDoc): number {
  const diff = b.createdAt.getTime() - a.createdAt.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Documento relevante de un tipo: entre los candidatos (si es mensual, sólo los del período
 * corriente), el más nuevo no rechazado; si todos están rechazados, el rechazado más nuevo.
 */
function pickRelevantDoc(type: ComplianceType, docs: readonly ComplianceDoc[], period: string): ComplianceDoc | null {
  const candidates = docs.filter((d) => (type.monthly ? normalizePeriod(d.period) === period : true)).sort(newestFirst);
  return candidates.find((d) => !isRejected(d)) ?? candidates[0] ?? null;
}

/** Estado derivado de un documento (o `faltante` si no hay). Lo reusan las listas para documentos de otros períodos. */
export function deriveState(type: ComplianceType, doc: ComplianceDoc | null, today: string): DocumentState {
  if (!doc) return 'faltante';
  if (isRejected(doc)) return 'rechazado';
  if ((type.hasExpiry && doc.validityDay !== null && doc.validityDay < today) || doc.storedState === 'vencido') {
    return 'vencido';
  }
  // El día del vencimiento todavía vale. 'pendiente' con archivo (legacy) se lee como presentado.
  return doc.storedState === 'aprobado' ? 'aprobado' : 'presentado';
}

/**
 * Evalúa un recurso contra los tipos y sus documentos (ya filtrados por recurso).
 * Sólo los obligatorios entran al status; un no obligatorio sólo genera fila si hay documento.
 */
export function evaluateResource(
  resource: ComplianceResource,
  types: readonly ComplianceType[],
  docs: readonly ComplianceDoc[],
  options: EvaluateOptions
): ResourceEvaluation {
  const { today, period } = options;
  const withFile = docs.filter(hasFile);

  const docsByType = new Map<string, ComplianceDoc[]>();
  for (const doc of withFile) {
    const list = docsByType.get(doc.typeId);
    if (list) list.push(doc);
    else docsByType.set(doc.typeId, [doc]);
  }

  const requirements: EvaluatedRequirement[] = [];
  const applicableTypeIds = new Set<string>();

  for (const type of types) {
    if (!typeAppliesTo(type, resource)) continue;
    applicableTypeIds.add(type.id);

    const doc = pickRelevantDoc(type, docsByType.get(type.id) ?? [], period);
    if (!doc && !type.mandatory) continue;

    const state = deriveState(type, doc, today);
    const daysToExpiry = doc && type.hasExpiry && doc.validityDay ? daysUntil(doc.validityDay, today) : null;
    const expiringSoon =
      (state === 'presentado' || state === 'aprobado') &&
      daysToExpiry !== null &&
      daysToExpiry >= 0 &&
      daysToExpiry <= EXPIRING_SOON_DAYS;

    requirements.push({ typeId: type.id, required: type.mandatory, state, doc, expiringSoon, daysToExpiry });
  }

  // "Ya no aplica": documentos con archivo cuyo tipo hoy no aplica (o no existe en el dataset).
  const notApplicable = withFile.filter((d) => !applicableTypeIds.has(d.typeId)).sort(newestFirst);

  const mandatory = requirements.filter((r) => r.required);
  const mandatoryTotal = mandatory.length;
  const mandatoryOk = mandatory.filter((r) => r.state === 'presentado' || r.state === 'aprobado').length;
  const missingOrRejected = mandatory.filter((r) => r.state === 'faltante' || r.state === 'rechazado').length;
  const expired = mandatory.filter((r) => r.state === 'vencido').length;

  return {
    requirements,
    notApplicable,
    status: aggregateStatus({ mandatoryTotal, missingOrRejected, expired }),
    mandatoryTotal,
    mandatoryOk,
  };
}
