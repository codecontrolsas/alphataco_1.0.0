/**
 * Tipos del motor puro de cumplimiento documental.
 *
 * Sin directiva 'use client'/'use server', sin Prisma: el motor recibe datos ya cargados y
 * devuelve el resultado. Todo `Date` se interpreta en hora argentina (ver `dates.ts`).
 */

/** Condición sobre una columna directa del recurso (`company_position`, `guild_id`, `brand`...). */
export interface DirectDocumentCondition {
  kind: 'direct';
  propertyKey: string;
  /** Columna en `employees` / `vehicles`. */
  filterColumn: string;
  ids: string[];
}

/** Condición M:M: el recurso debe tener al menos una fila en la pivote con `filterColumn` en `ids`. */
export interface ManyToManyDocumentCondition {
  kind: 'many_to_many';
  propertyKey: string;
  /** Tabla pivote (`empleado_aptitudes`, `contractor_employee`, `contractor_equipment`...). */
  relationTable: string;
  /** Columna de la pivote que referencia el catálogo (`aptitud_id`, `contractor_id`...). */
  filterColumn: string;
  ids: string[];
}

export type DocumentCondition = DirectDocumentCondition | ManyToManyDocumentCondition;

export type ConditionApplies = 'Persona' | 'Equipos';

/** A quién se le exige el tipo (`document_types.applies`, sólo los valores que usa el motor). */
export type ComplianceApplies = ConditionApplies;

/**
 * Perímetro del cargador de datasets: los recursos con status (`Persona`, `Equipos`) más la
 * `Empresa`, que es un único recurso sin condiciones ni status cacheado. `ComplianceApplies` (sin
 * `Empresa`) sigue siendo el tipo de los escritores del cache de status.
 */
export type ComplianceKind = ComplianceApplies | 'Empresa';

/**
 * Alcance de un tipo tal como está guardado: `special` + el `Json[]` crudo de `conditions`.
 * El motor lo resuelve con `resolveTypeScope`.
 */
export interface ComplianceTypeScope {
  special: boolean;
  conditions: unknown;
}

export interface ComplianceType {
  id: string;
  /** `null` = tipo global (de todas las empresas). */
  companyId: string | null;
  applies: ComplianceKind;
  mandatory: boolean;
  isActive: boolean;
  monthly: boolean;
  hasExpiry: boolean;
  downDocument: boolean;
  isPrivate: boolean;
  multiresource: boolean;
  scope: ComplianceTypeScope;
}

/** Resultado de resolver a quién aplica un tipo. */
export type TypeScope = { kind: 'all' } | { kind: 'none' } | { kind: 'conditions'; conditions: DocumentCondition[] };

export interface ComplianceResource {
  id: string;
  companyId: string;
  /** Tipo de recurso: decide con qué `document_types.applies` se compara. */
  applies: ComplianceKind;
  isActive: boolean;
  /** Columnas directas del recurso, ya como texto (`null` si no tiene valor). */
  direct: Record<string, string | null>;
  /** Tablas pivote M:M: valores de la columna de la pivote (`filterColumn`) como texto. */
  relations: Record<string, string[]>;
}

/** Estado guardado en la fila (`state`): llega de datos legacy y puede ser cualquier texto. */
export type StoredDocumentState = string;

export interface ComplianceDoc {
  id: string;
  typeId: string;
  storedState: StoredDocumentState | null;
  /** Vencimiento `YYYY-MM-DD` (ya en hora argentina), o `null`. */
  validityDay: string | null;
  /** Período crudo (`YYYY-MM` o `MM/YYYY`), o `null`. */
  period: string | null;
  /** Ruta del archivo. Sin ruta no es un documento (fila vacía legacy). */
  path: string | null;
  createdAt: Date;
}

export type DocumentState = 'faltante' | 'presentado' | 'aprobado' | 'rechazado' | 'vencido';

export interface EvaluatedRequirement {
  typeId: string;
  /** `true` si el tipo es obligatorio; un no obligatorio sólo genera fila si hay documento. */
  required: boolean;
  state: DocumentState;
  doc: ComplianceDoc | null;
  /** Marca (no estado): documento vigente que vence dentro de `EXPIRING_SOON_DAYS`. */
  expiringSoon: boolean;
  /** Días hasta el vencimiento (negativo si venció); `null` sin vencimiento o sin documento. */
  daysToExpiry: number | null;
}

export type ComplianceStatus = 'COMPLETO' | 'INCOMPLETO' | 'VENCIDO' | 'SIN_REQUISITOS';

/** Valores del enum `status_type` de la base que escribe el cache de status. */
export type StatusTypeValue = 'Completo' | 'Incompleto' | 'Completo con doc vencida';

export interface EvaluateOptions {
  /** `YYYY-MM-DD` en hora argentina (`arToday`). */
  today: string;
  /** `YYYY-MM` en hora argentina (`arCurrentPeriod`). */
  period: string;
}

export interface ResourceEvaluation {
  requirements: EvaluatedRequirement[];
  /** Documentos cuyo tipo hoy no aplica al recurso ("Ya no aplica"). */
  notApplicable: ComplianceDoc[];
  status: ComplianceStatus;
  mandatoryTotal: number;
  /** Obligatorios cargados (presentado o aprobado). */
  mandatoryOk: number;
}
