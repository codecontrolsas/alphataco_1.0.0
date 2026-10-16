import { matchesOne, parseDocumentConditions, resolveTypeScope } from './applicability';
import type { ComplianceResource, ComplianceType, DocumentCondition } from './types';

/**
 * Texto corto "Se pide por: ..." de un documento: el criterio por el que se le exige a un recurso.
 *
 * Módulo PURO y sin consultas: usa lo que ya viaja en el tipo (las `conditions` guardan, junto a los
 * `ids`, los nombres elegidos en `values` y la etiqueta en `property_label`) y los datos del recurso
 * que el motor ya cargó. No resuelve catálogos ni hace N+1.
 */

/** Cuántos valores se listan por criterio antes de resumir con "+N". */
const MAX_LISTED_VALUES = 3;

/** Etiquetas del vocabulario de las fichas cuando difieren de la que quedó guardada en la condición. */
const LABEL_OVERRIDES: Record<string, string> = {
  company_position: 'Puesto',
};

interface RawLabels {
  label: string | null;
  namesById: Map<string, string>;
}

function rawEntries(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Etiqueta y nombres (`ids[i]` -> `values[i]`) guardados en cada condición, por `property_key`. */
function readRawLabels(raw: unknown): Map<string, RawLabels> {
  const result = new Map<string, RawLabels>();
  for (const entry of rawEntries(raw)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const json = entry as Record<string, unknown>;
    const filterColumn = typeof json.filter_column === 'string' ? json.filter_column : null;
    const key = typeof json.property_key === 'string' ? json.property_key : filterColumn;
    if (!key) continue;
    const ids = Array.isArray(json.ids) ? json.ids.map(String) : [];
    const values = Array.isArray(json.values) ? json.values.map(String) : [];
    const namesById = new Map<string, string>();
    ids.forEach((id, i) => {
      if (values[i]) namesById.set(id, values[i]);
    });
    result.set(key, { label: typeof json.property_label === 'string' ? json.property_label : null, namesById });
  }
  return result;
}

function listValues(names: string[]): string {
  if (names.length <= MAX_LISTED_VALUES) return names.join(' o ');
  return `${names.slice(0, MAX_LISTED_VALUES).join(', ')} y ${names.length - MAX_LISTED_VALUES} más`;
}

/** Ids de la condición que el recurso cumple (los de su columna directa, o los de su pivote M:M). */
function matchedIds(resource: ComplianceResource, condition: DocumentCondition): string[] {
  if (condition.kind === 'direct') {
    const value = resource.direct[condition.filterColumn];
    return value != null && condition.ids.includes(value) ? [value] : [];
  }
  const values = resource.relations[condition.relationTable] ?? [];
  return condition.ids.filter((id) => values.includes(id));
}

function allScopeText(type: ComplianceType): string {
  if (type.applies === 'Equipos') return type.downDocument ? 'Equipos dados de baja' : 'Todos los equipos';
  if (type.applies === 'Empresa') return 'La empresa';
  return type.downDocument ? 'Personal dado de baja' : 'Todo el personal';
}

/**
 * Criterio por el que se le pide `type` a `resource`.
 * - Tipo general: "Todo el personal" / "Todos los equipos".
 * - Tipo con condiciones: "Puesto = Operador de excavadora · Clientes = Vista Oil" (sólo los valores
 *   que el recurso cumple). Si hoy NO las cumple ("Ya no aplica") se listan los que exige el tipo.
 * `null` si el tipo no alcanza a nadie (condiciones ilegibles).
 */
export function describeRequirementReason(type: ComplianceType, resource: ComplianceResource): string | null {
  const scope = resolveTypeScope(type);
  if (scope.kind === 'none') return null;
  if (scope.kind === 'all') return allScopeText(type);

  const labels = readRawLabels(type.scope.conditions);
  // `parseDocumentConditions` descarta las entradas inválidas igual que el motor: los textos usan las mismas.
  const conditions = parseDocumentConditions(type.scope.conditions);
  const parts = conditions.map((condition) => {
    const raw = labels.get(condition.propertyKey);
    const label = LABEL_OVERRIDES[condition.propertyKey] ?? raw?.label ?? condition.propertyKey;
    const matched = matchesOne(resource, condition) ? matchedIds(resource, condition) : condition.ids;
    const names = matched.map((id) => raw?.namesById.get(id) ?? id);
    return `${label} = ${listValues(names)}`;
  });
  return parts.join(' · ');
}
