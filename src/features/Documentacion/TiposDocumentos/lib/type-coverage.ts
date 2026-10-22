/**
 * Cobertura de un tipo de documento sobre los recursos de una empresa (módulo PURO, sin Prisma).
 *
 * Es la base del diagnóstico de "Verificación de documentos" y del contador del formulario de tipos:
 * todo se calcula con el motor de cumplimiento (`shared/compliance`), sin filas pendientes.
 */

import type { ComplianceDoc, ComplianceResource, ComplianceType, EvaluateOptions } from '@/features/Documentacion/shared/compliance/types';
import { evaluateResource } from '@/features/Documentacion/shared/compliance/evaluation';
import { typeAppliesTo } from '@/features/Documentacion/shared/compliance/applicability';

export interface TypeCoverage {
  /** Recursos evaluados (todos los de la empresa para ese tipo de recurso). */
  totalResources: number;
  /** Recursos a los que el tipo les aplica hoy. */
  applicableIds: string[];
  /** Recursos a los que aplica y que ya tienen un documento relevante cargado. */
  withDocumentIds: string[];
  /** Recursos a los que aplica, el tipo es obligatorio y no tienen documento. */
  missingIds: string[];
  /** Recursos a los que el tipo ya no les aplica pero conservan un documento cargado ("ya no aplica"). */
  notApplicableWithDocumentIds: string[];
}

export function computeTypeCoverage(
  type: ComplianceType,
  resources: readonly ComplianceResource[],
  docsByResource: ReadonlyMap<string, readonly ComplianceDoc[]>,
  options: EvaluateOptions
): TypeCoverage {
  const coverage: TypeCoverage = {
    totalResources: resources.length,
    applicableIds: [],
    withDocumentIds: [],
    missingIds: [],
    notApplicableWithDocumentIds: [],
  };

  for (const resource of resources) {
    const ownDocs = (docsByResource.get(resource.id) ?? []).filter((doc) => doc.typeId === type.id);
    const evaluation = evaluateResource(resource, [type], ownDocs, options);
    const requirement = evaluation.requirements[0];

    if (typeAppliesTo(type, resource)) {
      coverage.applicableIds.push(resource.id);
      if (requirement?.doc) coverage.withDocumentIds.push(resource.id);
      else if (type.mandatory) coverage.missingIds.push(resource.id);
    } else if (evaluation.notApplicable.length > 0) {
      coverage.notApplicableWithDocumentIds.push(resource.id);
    }
  }
  return coverage;
}

export interface ApplicabilityDelta {
  /** Recursos a los que el borrador les aplica. */
  matching: number;
  /** Recursos a los que el tipo guardado no les aplica y el borrador sí. */
  startsRequiring: number;
  /** Recursos a los que el tipo guardado les aplica y el borrador no. */
  stopsRequiring: number;
}

/**
 * Cuántos recursos cumplen el borrador y, si hay un tipo guardado para comparar, cuántos empiezan
 * y cuántos dejan de exigirlo. Sin tipo guardado (alta), los dos deltas son 0.
 */
export function computeApplicabilityDelta(
  draft: ComplianceType,
  current: ComplianceType | null,
  resources: readonly ComplianceResource[]
): ApplicabilityDelta {
  let matching = 0;
  let startsRequiring = 0;
  let stopsRequiring = 0;
  for (const resource of resources) {
    const next = typeAppliesTo(draft, resource);
    if (next) matching += 1;
    if (!current) continue;
    const before = typeAppliesTo(current, resource);
    if (next && !before) startsRequiring += 1;
    if (!next && before) stopsRequiring += 1;
  }
  return { matching, startsRequiring, stopsRequiring };
}
