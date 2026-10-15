import type { ComplianceResource, ComplianceType, DocumentCondition, TypeScope } from './types';

/** Ids como texto, sin `null` ni `''` (misma limpieza que `id IS NOT NULL AND id <> ''` en SQL). */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string | number | bigint => ['string', 'number', 'bigint'].includes(typeof v))
    .map(String)
    .filter((v) => v !== '');
}

/** Normaliza el `Json[]` (o su string) a un array; `null` si no se puede leer. */
function toEntries(raw: unknown): unknown[] | null {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string') {
    if (raw.trim() === '') return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return Array.isArray(raw) ? raw : null;
}

/**
 * Convierte el `Json[]` de `document_types.conditions` (o su string) a condiciones discriminadas.
 * Tolerante: entradas que no son objeto, sin `ids` o cuyos `ids` quedan vacíos se ignoran.
 * Devuelve `[]` tanto para "sin condiciones" como para "todas inválidas"; para distinguirlos
 * usar `resolveTypeScope`.
 */
export function parseDocumentConditions(raw: unknown): DocumentCondition[] {
  const entries = toEntries(raw);
  if (!entries) return [];

  const result: DocumentCondition[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const json = entry as Record<string, unknown>;
    const ids = toStringArray(json.ids);
    const filterColumn = typeof json.filter_column === 'string' ? json.filter_column : null;
    if (ids.length === 0 || !filterColumn) continue;
    const propertyKey = typeof json.property_key === 'string' ? json.property_key : filterColumn;
    const relationTable = typeof json.relation_table === 'string' ? json.relation_table : null;

    if (json.relation_type === 'many_to_many' && relationTable) {
      result.push({ kind: 'many_to_many', propertyKey, relationTable, filterColumn, ids });
    } else {
      result.push({ kind: 'direct', propertyKey, filterColumn, ids });
    }
  }
  return result;
}

/**
 * A quién aplica un tipo:
 * - no especial, o especial sin condiciones cargadas (vacío/NULL) → `all`;
 * - especial con condiciones cargadas pero ninguna válida (o ilegible) → `none` (no aplica a nadie);
 * - si no → `conditions`.
 */
export function resolveTypeScope(type: Pick<ComplianceType, 'scope'>): TypeScope {
  if (!type.scope.special) return { kind: 'all' };
  const entries = toEntries(type.scope.conditions);
  if (entries !== null && entries.length === 0) return { kind: 'all' };
  const conditions = parseDocumentConditions(entries ?? []);
  if (conditions.length === 0) return { kind: 'none' };
  return { kind: 'conditions', conditions };
}

function matchesOne(resource: ComplianceResource, condition: DocumentCondition): boolean {
  if (condition.kind === 'direct') {
    const value = resource.direct[condition.filterColumn];
    if (value === null || value === undefined) return false;
    return condition.ids.includes(String(value));
  }
  // Relación no cargada (o desconocida): falla cerrada, no explota.
  const values = resource.relations[condition.relationTable];
  if (!Array.isArray(values)) return false;
  return values.some((v) => condition.ids.includes(String(v)));
}

/**
 * `true` si el recurso cumple TODAS las condiciones (AND entre objetos de condición; OR dentro de
 * los `ids` de cada una). Los valores se comparan como texto (uuid, enum y bigint por igual).
 * Sin condiciones → `true`.
 */
export function resourceMatchesConditions(
  resource: ComplianceResource,
  conditions: readonly DocumentCondition[]
): boolean {
  return conditions.every((condition) => matchesOne(resource, condition));
}

/**
 * ¿El tipo se le exige a este recurso? Verdadero sólo si: el tipo está activo; `applies` coincide;
 * es global o de la empresa del recurso; un recurso ACTIVO no recibe tipos `downDocument` y uno de
 * BAJA recibe SOLO esos; y el alcance del tipo lo admite.
 */
export function typeAppliesTo(type: ComplianceType, resource: ComplianceResource): boolean {
  if (!type.isActive) return false;
  if (type.applies !== resource.applies) return false;
  if (type.companyId !== null && type.companyId !== resource.companyId) return false;
  if (resource.isActive === type.downDocument) return false;

  const scope = resolveTypeScope(type);
  if (scope.kind === 'none') return false;
  if (scope.kind === 'all') return true;
  return resourceMatchesConditions(resource, scope.conditions);
}
