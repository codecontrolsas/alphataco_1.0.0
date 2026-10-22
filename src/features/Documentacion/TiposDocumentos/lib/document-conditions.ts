/**
 * Condiciones de los tipos de documento especiales (`document_types.conditions`, `Json[]`).
 *
 * Módulo PURO (sin Prisma ni 'use server'). Los tipos, el parseo y la evaluación viven en el motor
 * (`shared/compliance`); acá se reexportan para no romper a los importadores. La regla de negocio es la misma que `build_employee_where_alias` en Postgres:
 * un recurso cumple el tipo sólo si cumple TODAS las condiciones del array (AND), tanto las
 * simples (columna directa de `employees`/`vehicles`) como las M:M (fila en la tabla pivote).
 *
 * Evaluar sólo `conditions[0]` a mano dio un falso negativo en el ticket 712: un tipo tenía dos
 * condiciones y la segunda era una relación M:M. De ahí `resourceMatchesConditions`.
 */

import { resourceMatchesConditions as matchesComplianceConditions } from '../../shared/compliance/applicability';
import type { ComplianceResource, DocumentCondition } from '../../shared/compliance/types';

export type {
  ConditionApplies,
  DirectDocumentCondition,
  DocumentCondition,
  ManyToManyDocumentCondition,
} from '../../shared/compliance/types';

/**
 * Recurso a evaluar: fila de `employees`/`vehicles` con las relaciones M:M cargadas como
 * arrays de filas de la pivote (`{ empleado_aptitudes: [{ aptitud_id }] }`).
 */
export type ConditionResource = Record<string, unknown>;

/**
 * `true` si el recurso cumple TODAS las condiciones (sin condiciones → aplica a todos).
 * Adaptador de la forma "plana" histórica (columnas directas + filas de pivote) al motor
 * (`resourceMatchesConditions` de `shared/compliance`, que recibe `ComplianceResource`).
 */
export function resourceMatchesConditions(
  resource: ConditionResource,
  conditions: readonly DocumentCondition[]
): boolean {
  const direct: ComplianceResource['direct'] = {};
  const relations: ComplianceResource['relations'] = {};
  for (const condition of conditions) {
    if (condition.kind === 'direct') {
      const value = resource[condition.filterColumn];
      direct[condition.filterColumn] = value === null || value === undefined ? null : String(value);
      continue;
    }
    const rows = resource[condition.relationTable];
    if (!Array.isArray(rows)) continue;
    relations[condition.relationTable] = rows.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const value = (row as Record<string, unknown>)[condition.filterColumn];
      return value === null || value === undefined ? [] : [String(value)];
    });
  }
  return matchesComplianceConditions(
    { id: '', companyId: '', applies: 'Persona', isActive: true, direct, relations },
    conditions
  );
}
