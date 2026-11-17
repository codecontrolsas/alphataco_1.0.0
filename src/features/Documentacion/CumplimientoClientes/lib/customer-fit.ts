import { evaluateResource } from '@/features/Documentacion/shared/compliance/evaluation';
import type {
  ComplianceDoc,
  ComplianceResource,
  ComplianceType,
  DocumentState,
} from '@/features/Documentacion/shared/compliance/types';

/**
 * Cumplimiento documental de un recurso FRENTE A UN CLIENTE, en un período.
 *
 * Módulo puro (sin Prisma ni `server-only`): reusa el motor de cumplimiento con un recurso "simulado" que está
 * afectado SOLO a ese cliente. Así se le exigen los tipos generales y los que el cliente pide (condición «Clientes»),
 * y no los que piden otros clientes. Sirve igual para un recurso ya afectado que para uno que se quiere sumar.
 *
 * Supuesto de negocio: el "contrato/operadora" de otros sistemas es el CLIENTE de Alphataco.
 */

/** Pivote de afectación a clientes según el tipo de recurso. */
export const CUSTOMER_PIVOT = {
  Persona: 'contractor_employee',
  Equipos: 'contractor_equipment',
} as const;

export type FitResourceKind = keyof typeof CUSTOMER_PIVOT;

/**
 * - `ok`: cumple durante todo el período.
 * - `expiring`: cumple hoy, pero algo vence dentro del período (o, sin período, en los próximos 30 días).
 * - `blocked`: falta, está rechazado o vencido algún documento obligatorio.
 */
export type CustomerFitStatus = 'ok' | 'expiring' | 'blocked';

export interface FitIssue {
  typeId: string;
  state: DocumentState;
  /** Vencimiento `YYYY-MM-DD` del documento, si tiene. */
  validityDay: string | null;
}

export interface CustomerFit {
  status: CustomerFitStatus;
  /** Obligatorios que hoy no se cumplen (faltante, rechazado o vencido). */
  blocking: FitIssue[];
  /** Obligatorios vigentes que vencen dentro del período o pronto. */
  expiring: FitIssue[];
  mandatoryTotal: number;
}

export interface FitWindow {
  /** `YYYY-MM-DD` de inicio (hora argentina). */
  from: string;
  /** `YYYY-MM-DD` de fin, inclusive. Igual a `from` para "hoy". */
  to: string;
  /** `YYYY-MM` que se usa para los tipos mensuales (el del día de inicio). */
  period: string;
}

/** El recurso tal cual, pero afectado únicamente a `customerId`. */
export function asAssignedTo(resource: ComplianceResource, customerId: string): ComplianceResource {
  if (resource.applies === 'Empresa') return resource;
  return { ...resource, relations: { ...resource.relations, [CUSTOMER_PIVOT[resource.applies]]: [customerId] } };
}

const BLOCKING_STATES: ReadonlySet<DocumentState> = new Set(['faltante', 'rechazado', 'vencido']);

function toIssue(req: { typeId: string; state: DocumentState; doc: ComplianceDoc | null }): FitIssue {
  return { typeId: req.typeId, state: req.state, validityDay: req.doc?.validityDay ?? null };
}

/**
 * Evalúa al recurso para el cliente en la ventana. Se evalúa dos veces: al inicio (lo que hoy no se cumple bloquea) y
 * al fin (lo vigente al inicio que ya venció al fin "vence durante el período"). Si la ventana es de un día, "por
 * vencer" usa la marca del motor (vence en los próximos 30 días).
 */
export function evaluateCustomerFit(
  resource: ComplianceResource,
  customerId: string,
  types: readonly ComplianceType[],
  docs: readonly ComplianceDoc[],
  window: FitWindow
): CustomerFit {
  const simulated = asAssignedTo(resource, customerId);
  const atStart = evaluateResource(simulated, types, docs, { today: window.from, period: window.period });
  const mandatoryAtStart = atStart.requirements.filter((r) => r.required);
  const blocking = mandatoryAtStart.filter((r) => BLOCKING_STATES.has(r.state)).map(toIssue);

  let expiring: FitIssue[];
  if (window.to > window.from) {
    const atEnd = evaluateResource(simulated, types, docs, { today: window.to, period: window.period });
    const endState = new Map(atEnd.requirements.map((r) => [r.typeId, r.state]));
    expiring = mandatoryAtStart
      .filter((r) => !BLOCKING_STATES.has(r.state) && endState.get(r.typeId) === 'vencido')
      .map(toIssue);
  } else {
    expiring = mandatoryAtStart.filter((r) => r.expiringSoon).map(toIssue);
  }

  const byDate = (a: FitIssue, b: FitIssue) => (a.validityDay ?? '').localeCompare(b.validityDay ?? '');
  expiring.sort(byDate);

  return {
    status: blocking.length > 0 ? 'blocked' : expiring.length > 0 ? 'expiring' : 'ok',
    blocking,
    expiring,
    mandatoryTotal: mandatoryAtStart.length,
  };
}

/** Orden de gravedad para ordenar listas (lo que bloquea primero). */
export const FIT_STATUS_RANK: Record<CustomerFitStatus, number> = { blocked: 0, expiring: 1, ok: 2 };

/** Textos de cada estado. `window` cambia el de "por vencer": en un período es "vence durante el período". */
export function fitStatusLabel(status: CustomerFitStatus, hasWindow = false): string {
  if (status === 'ok') return hasWindow ? 'Cumple todo el período' : 'Cumple';
  if (status === 'expiring') return hasWindow ? 'Vence durante el período' : 'Por vencer';
  return 'No cumple';
}

/** Texto corto del problema de un documento, sin el nombre del tipo. */
export function issueStateLabel(issue: FitIssue): string {
  if (issue.state === 'faltante') return 'Falta cargar';
  if (issue.state === 'rechazado') return 'Rechazado';
  if (issue.state === 'vencido') return 'Vencido';
  return 'Vence';
}

/** Celda compacta para el cliente (claves cortas: viajan muchas). */
export interface FitCell {
  s: CustomerFitStatus;
  b: { t: string; s: DocumentState; v: string | null }[];
  e: { t: string; s: DocumentState; v: string | null }[];
  /** Condición del equipo cuando no está operativo (`en reparacion`...): no se puede asignar aunque tenga los papeles. */
  o?: string;
}

/** `true` si la condición del equipo impide asignarlo. `null` (personas o sin dato) no lo impide. */
export function isNotOperative(condition: string | null): boolean {
  return condition !== null && condition !== 'operativo';
}

/**
 * Celda del recurso para el cliente. Un equipo no operativo queda en "No cumple" aunque tenga los papeles al día: es la
 * misma regla en la matriz, el widget del tablero y el simulador.
 */
export function toCell(fit: CustomerFit, condition: string | null = null): FitCell {
  const compact = (issue: FitIssue) => ({ t: issue.typeId, s: issue.state, v: issue.validityDay });
  const cell: FitCell = { s: fit.status, b: fit.blocking.map(compact), e: fit.expiring.map(compact) };
  if (isNotOperative(condition)) {
    cell.s = 'blocked';
    cell.o = condition ?? undefined;
  }
  return cell;
}
