import 'server-only';

import { EXPIRING_SOON_DAYS } from '@/features/Documentacion/shared/lib/document-expiry';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { typeAppliesTo } from '../../shared/compliance/applicability';
import { arToday, daysUntil } from '../../shared/compliance/dates';
import { deriveState } from '../../shared/compliance/evaluation';
import { loadComplianceDataset } from '../../shared/compliance/server/dataset.server';
import type { ComplianceKind, DocumentState } from '../../shared/compliance/types';

/**
 * Lectura DERIVADA de un documento real para la ficha: su estado se calcula con el motor (vencido
 * por fecha, hora argentina) y "Ya no aplica" sale de la aplicabilidad actual del tipo al recurso,
 * no de una columna guardada.
 */
export interface DocumentDerivedView {
  /** Nunca `faltante`: un documento real siempre tiene archivo. */
  state: Exclude<DocumentState, 'faltante'>;
  /** El tipo de documento hoy no le aplica al recurso (cambió su función o condición). */
  notApplicable: boolean;
  /** Vigente y vence dentro de `EXPIRING_SOON_DAYS`. */
  expiringSoon: boolean;
  /** Días hasta el vencimiento (negativo si venció); `null` si el tipo no vence o no hay fecha. */
  daysToExpiry: number | null;
}

/**
 * Vista derivada del documento `documentId` del recurso `resourceId` (para `Empresa`, el id de la
 * empresa activa). `null` si el documento no tiene archivo o el recurso no es de la empresa activa.
 */
export async function getDocumentDerivedView(
  kind: ComplianceKind,
  resourceId: string,
  documentId: string
): Promise<DocumentDerivedView | null> {
  const companyId = await getActiveCompanyId();
  const dataset = await loadComplianceDataset(prisma, { companyId, kind, resourceIds: [resourceId] });

  const resource = dataset.resources.find((r) => r.id === resourceId);
  if (!resource) return null;
  const doc = (dataset.docsByResource.get(resourceId) ?? []).find((d) => d.id === documentId);
  if (!doc) return null;
  const type = dataset.types.find((t) => t.id === doc.typeId);
  if (!type) return { state: 'presentado', notApplicable: true, expiringSoon: false, daysToExpiry: null };

  const today = arToday();
  const state = deriveState(type, doc, today);
  if (state === 'faltante') return null;
  const daysToExpiry = type.hasExpiry && doc.validityDay ? daysUntil(doc.validityDay, today) : null;
  const expiringSoon =
    (state === 'presentado' || state === 'aprobado') &&
    daysToExpiry !== null &&
    daysToExpiry >= 0 &&
    daysToExpiry <= EXPIRING_SOON_DAYS;

  return { state, notApplicable: !typeAppliesTo(type, resource), expiringSoon, daysToExpiry };
}
