/**
 * Lógica PURA del cambio de estado de los módulos (F3.1): estado actual + pedido → plan. Sin base: es lo que se prueba
 * con unitarios (`modules-plan.test.ts`) y lo que usan la vista previa (`POST /modules/plan`) y la aplicación
 * (`PUT /modules`, que recalcula el plan dentro de la transacción).
 *
 * Reglas (blueprint F3, §4.3):
 * 1. Apagar X está BLOQUEADO si en el mismo ámbito queda encendida alguna clave que depende de X en forma dura
 *    (`HAS_DEPENDENTS`). Salida explícita: `cascade: true`, que apaga también esos dependientes (se ven antes en
 *    `cascadePreview`).
 * 2. Encender Y está BLOQUEADO si le falta una dependencia dura (`MISSING_DEPENDENCIES`). Salida explícita:
 *    `withDependencies: true`. En el ámbito empresa nunca se supera a la instancia (`INSTANCE_DISABLED`).
 * 3. Las blandas no bloquean: se informan en `softImpacts`.
 * 4. `nucleo` no se apaga ni se enciende (`CORE`).
 * 5. Un cambio en la instancia que dejaría a una empresa con una clave sin sus dependencias (porque la empresa apagó
 *    una de ellas) escribe una fila de empresa que la apaga: si la clave estaba encendida en esa empresa es una
 *    cascada (exige `cascade`); si estaba apagada solo la mantiene apagada (`dependency`).
 */
import {
  CORE_MODULE,
  MODULE_CATALOG,
  MODULE_KEYS,
  SWITCHABLE_MODULE_KEYS,
  isModuleKey,
  missingDependencies,
  shutdownOrder,
  type ModuleKey,
} from '@/features/Modules/catalog';
import { createHash } from 'node:crypto';

export type ModuleScope = 'instance' | 'company';
export type ChangeCause = 'requested' | 'cascade' | 'dependency';
export type BlockCode =
  | 'HAS_DEPENDENTS'
  | 'MISSING_DEPENDENCIES'
  | 'INSTANCE_DISABLED'
  | 'CORE'
  | 'UNKNOWN_KEY'
  | 'COMPANY_NOT_FOUND';

/** Filas de estado tal como están en la base (`enabled` de cada fila; sin fila = no está en el mapa). */
export interface ModuleState {
  instance: ReadonlyMap<string, boolean>;
  /** Por empresa EXISTENTE (las que no tienen filas van con un mapa vacío). */
  companies: ReadonlyMap<string, ReadonlyMap<string, boolean>>;
}

export interface PlanRequest {
  scope: ModuleScope;
  companyId: string | null;
  changes: readonly { key: string; enabled: boolean }[];
  cascade: boolean;
  withDependencies: boolean;
}

export interface PlanEffect {
  scope: ModuleScope;
  companyId: string | null;
  key: ModuleKey;
  /** Valor de la fila antes del cambio (`null` = no había fila). */
  from: boolean | null;
  to: boolean;
  cause: ChangeCause;
}

export interface PlanBlock {
  key: string;
  code: BlockCode;
  companyId?: string;
  /** HAS_DEPENDENTS: claves encendidas que dependen de esta. */
  dependents?: ModuleKey[];
  /** MISSING_DEPENDENCIES / INSTANCE_DISABLED: dependencias que faltan. */
  missing?: ModuleKey[];
}

export interface SoftImpact {
  key: ModuleKey;
  because: ModuleKey;
  message: string;
}

export interface ModulePlan {
  applicable: boolean;
  effective: PlanEffect[];
  blocked: PlanBlock[];
  /** Lo que agregaría `cascade: true` (vacío si ya se pidió o si no hace falta). */
  cascadePreview: PlanEffect[];
  softImpacts: SoftImpact[];
  /** Empresas cuyo conjunto efectivo cambia. */
  affectedCompanies: number;
}

/** Claves encendidas en la instancia (solo claves del catálogo; `nucleo` siempre). */
export function instanceEnabledSet(state: ModuleState): Set<ModuleKey> {
  const set = new Set<ModuleKey>([CORE_MODULE]);
  for (const [key, enabled] of state.instance) if (enabled && isModuleKey(key)) set.add(key);
  return set;
}

/** Claves encendidas para una empresa: las de la instancia menos las que la empresa apagó. */
export function companyEnabledSet(state: ModuleState, companyId: string, instanceSet = instanceEnabledSet(state)) {
  const rows = state.companies.get(companyId);
  const set = new Set(instanceSet);
  for (const [key, enabled] of rows ?? []) if (!enabled && isModuleKey(key)) set.delete(key as ModuleKey);
  return set;
}

/**
 * Versión del estado (concurrencia optimista): sha256 de las filas de instancia y de empresa, ordenadas. El plan la
 * devuelve y el PUT la exige: lo que se vio en la vista previa es lo que se aplica.
 */
export function computeStateVersion(state: ModuleState): string {
  const lines: string[] = [];
  for (const [key, enabled] of [...state.instance].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`i:${key}:${enabled ? 1 : 0}`);
  }
  for (const companyId of [...state.companies.keys()].sort()) {
    for (const [key, enabled] of [...(state.companies.get(companyId) ?? [])].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`c:${companyId}:${key}:${enabled ? 1 : 0}`);
    }
  }
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

interface CoreResult {
  set: Set<ModuleKey>;
  offs: Map<ModuleKey, ChangeCause>;
  ons: Map<ModuleKey, ChangeCause>;
  blocked: PlanBlock[];
}

/**
 * Aplica los cambios pedidos a un conjunto y resuelve las dependencias hasta un punto fijo. `allowed` limita lo que se
 * puede encender (en el ámbito empresa, lo encendido en la instancia).
 */
function resolveScope(
  base: ReadonlySet<ModuleKey>,
  requested: ReadonlyMap<ModuleKey, boolean>,
  options: { cascade: boolean; withDependencies: boolean; allowed: ReadonlySet<ModuleKey> | null; companyId?: string }
): CoreResult {
  const offs = new Map<ModuleKey, ChangeCause>();
  const ons = new Map<ModuleKey, ChangeCause>();
  const blocked: PlanBlock[] = [];
  const blockedKeys = new Set<ModuleKey>();
  const companyTag = options.companyId ? { companyId: options.companyId } : {};

  for (const [key, enabled] of requested) {
    if (enabled && !base.has(key)) {
      if (options.allowed && !options.allowed.has(key)) {
        blocked.push({ key, code: 'INSTANCE_DISABLED', ...companyTag });
        blockedKeys.add(key);
        continue;
      }
      ons.set(key, 'requested');
    } else if (!enabled && base.has(key)) {
      offs.set(key, 'requested');
    }
  }

  const current = () => {
    const set = new Set(base);
    for (const key of offs.keys()) set.delete(key);
    for (const key of ons.keys()) set.add(key);
    for (const key of blockedKeys) if (!base.has(key)) set.delete(key);
    return set;
  };

  const dependentsBlocked = new Map<ModuleKey, Set<ModuleKey>>();
  // Cada vuelta enciende o apaga al menos una clave, o la marca bloqueada: termina en a lo sumo 2·|claves| vueltas.
  for (let guard = 0; guard < MODULE_KEYS.length * 2 + 2; guard += 1) {
    const set = current();
    const unsatisfied = [...set].filter(
      (key) => !blockedKeys.has(key) && !isHandledDependent(key) && missingDependencies(key, set).length > 0
    );
    if (unsatisfied.length === 0) break;

    for (const key of unsatisfied) {
      const missing = missingDependencies(key, set);
      // Se está encendiendo (o se pidió encendida aunque ya lo estuviera) y le faltan dependencias.
      if (ons.has(key) || requested.get(key) === true) {
        if (!ons.has(key)) ons.set(key, 'requested');
        if (!options.withDependencies) {
          blocked.push({ key, code: 'MISSING_DEPENDENCIES', missing, ...companyTag });
          blockedKeys.add(key);
          ons.delete(key);
          continue;
        }
        const added = addDependencies(key, set);
        if (!added) {
          ons.delete(key);
          blockedKeys.add(key);
        }
        continue;
      }
      // Estaba encendida y un apagado la dejó sin una dependencia.
      if (options.cascade) {
        offs.set(key, 'cascade');
        continue;
      }
      for (const dep of missing) {
        if (!offs.has(dep)) continue;
        const list = dependentsBlocked.get(dep) ?? new Set<ModuleKey>();
        list.add(key);
        dependentsBlocked.set(dep, list);
      }
    }
  }

  for (const [key, dependents] of dependentsBlocked) {
    blocked.push({ key, code: 'HAS_DEPENDENTS', dependents: shutdownOrder(dependents), ...companyTag });
  }

  return { set: current(), offs, ons, blocked };

  function isHandledDependent(key: ModuleKey): boolean {
    for (const dependents of dependentsBlocked.values()) if (dependents.has(key)) return true;
    return false;
  }

  /** Agrega las dependencias faltantes de `key` (por grupo `requiresAny`, la primera posible). */
  function addDependencies(key: ModuleKey, set: ReadonlySet<ModuleKey>): boolean {
    const def = MODULE_CATALOG[key];
    const needed: ModuleKey[] = def.requires.filter((dep) => !set.has(dep));
    for (const group of def.requiresAny ?? []) {
      if (group.some((dep) => set.has(dep))) continue;
      const candidate = group.find((dep) => !offs.has(dep) && (!options.allowed || options.allowed.has(dep)));
      needed.push(candidate ?? group[0]);
    }
    const impossible = needed.filter((dep) => offs.has(dep) || (options.allowed !== null && !options.allowed.has(dep)));
    if (impossible.length > 0) {
      const code = impossible.some((dep) => offs.has(dep)) ? 'MISSING_DEPENDENCIES' : 'INSTANCE_DISABLED';
      blocked.push({ key, code, missing: impossible, ...companyTag });
      return false;
    }
    for (const dep of needed) if (!ons.has(dep)) ons.set(dep, 'dependency');
    return true;
  }
}

/** Saca de un conjunto, hasta un punto fijo, las claves que quedaron sin sus dependencias. Devuelve las que salieron. */
function pruneUnsatisfied(set: Set<ModuleKey>): ModuleKey[] {
  const removed: ModuleKey[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const key of [...set]) {
      if (key !== CORE_MODULE && missingDependencies(key, set).length > 0) {
        set.delete(key);
        removed.push(key);
        changed = true;
      }
    }
  }
  return removed;
}

function softImpactsFor(offKeys: Iterable<ModuleKey>, finalSet: ReadonlySet<ModuleKey>): SoftImpact[] {
  const impacts: SoftImpact[] = [];
  for (const off of offKeys) {
    for (const key of MODULE_KEYS) {
      const def = MODULE_CATALOG[key];
      if (!finalSet.has(key) || !def.softDeps.includes(off)) continue;
      impacts.push({
        key,
        because: off,
        message:
          def.softImpactMessages?.[off] ?? `${def.name} deja de mostrar lo que depende de ${MODULE_CATALOG[off].name}.`,
      });
    }
  }
  return impacts;
}

function sameSet(a: ReadonlySet<ModuleKey>, b: ReadonlySet<ModuleKey>): boolean {
  return a.size === b.size && [...a].every((key) => b.has(key));
}

/** Plan de un pedido sobre el estado dado. No escribe nada. */
export function computeModulePlan(state: ModuleState, request: PlanRequest): ModulePlan {
  const blocked: PlanBlock[] = [];
  const requested = new Map<ModuleKey, boolean>();
  for (const change of request.changes) {
    if (!isModuleKey(change.key)) {
      blocked.push({ key: change.key, code: 'UNKNOWN_KEY' });
    } else if (change.key === CORE_MODULE) {
      blocked.push({ key: change.key, code: 'CORE' });
    } else {
      requested.set(change.key, change.enabled);
    }
  }

  const empty: ModulePlan = {
    applicable: false,
    effective: [],
    blocked,
    cascadePreview: [],
    softImpacts: [],
    affectedCompanies: 0,
  };

  if (request.scope === 'company') {
    const companyId = request.companyId;
    if (!companyId || !state.companies.has(companyId)) {
      return { ...empty, blocked: [...blocked, { key: '*', code: 'COMPANY_NOT_FOUND' }] };
    }
    return planCompany(state, request, companyId, requested, blocked);
  }
  return planInstance(state, request, requested, blocked);
}

function planInstance(
  state: ModuleState,
  request: PlanRequest,
  requested: ReadonlyMap<ModuleKey, boolean>,
  preBlocked: PlanBlock[]
): ModulePlan {
  const before = instanceEnabledSet(state);
  const options = { withDependencies: request.withDependencies, allowed: null };
  const result = resolveScope(before, requested, { ...options, cascade: request.cascade });
  const blocked = [...preBlocked, ...result.blocked];

  const effective: PlanEffect[] = [];
  const pushInstance = (key: ModuleKey, to: boolean, cause: ChangeCause) =>
    effective.push({ scope: 'instance', companyId: null, key, from: state.instance.get(key) ?? null, to, cause });
  for (const key of shutdownOrder(result.offs.keys())) pushInstance(key, false, result.offs.get(key) as ChangeCause);
  for (const key of SWITCHABLE_MODULE_KEYS) {
    const cause = result.ons.get(key);
    if (cause) pushInstance(key, true, cause);
  }

  // Empresas: lo que la instancia cambia no puede dejar una clave encendida sin sus dependencias en ninguna empresa.
  const cascadePreview: PlanEffect[] = [];
  let affectedCompanies = 0;
  const instanceAfter = result.set;
  // Lo que ya queda sin dependencias en la instancia se informa (y se bloquea) a nivel instancia, no por empresa.
  const instanceUnsatisfied = new Set(pruneUnsatisfied(new Set(instanceAfter)));
  for (const [companyId, rows] of state.companies) {
    const companyBefore = companyEnabledSet(state, companyId, before);
    const companyAfter = companyEnabledSet(state, companyId, instanceAfter);
    for (const key of instanceUnsatisfied) companyAfter.delete(key);
    const removed = pruneUnsatisfied(companyAfter);
    const destructive = removed.filter((key) => companyBefore.has(key));
    if (destructive.length > 0 && !request.cascade) {
      blocked.push({
        key: '*',
        code: 'HAS_DEPENDENTS',
        companyId,
        dependents: shutdownOrder(destructive),
      });
    }
    for (const key of shutdownOrder(removed)) {
      const cause: ChangeCause = companyBefore.has(key) ? 'cascade' : 'dependency';
      const effect: PlanEffect = { scope: 'company', companyId, key, from: rows.get(key) ?? null, to: false, cause };
      if (cause === 'cascade' && !request.cascade) cascadePreview.push(effect);
      else effective.push(effect);
    }
    if (!sameSet(companyBefore, companyAfter)) affectedCompanies += 1;
  }

  if (!request.cascade && result.blocked.some((block) => block.code === 'HAS_DEPENDENTS')) {
    const preview = resolveScope(before, requested, { ...options, cascade: true });
    for (const key of shutdownOrder(preview.offs.keys())) {
      if (preview.offs.get(key) !== 'cascade') continue;
      cascadePreview.push({
        scope: 'instance',
        companyId: null,
        key,
        from: state.instance.get(key) ?? null,
        to: false,
        cause: 'cascade',
      });
    }
  }

  return {
    applicable: blocked.length === 0,
    effective,
    blocked,
    cascadePreview,
    softImpacts: softImpactsFor(result.offs.keys(), instanceAfter),
    affectedCompanies,
  };
}

function planCompany(
  state: ModuleState,
  request: PlanRequest,
  companyId: string,
  requested: ReadonlyMap<ModuleKey, boolean>,
  preBlocked: PlanBlock[]
): ModulePlan {
  const instanceSet = instanceEnabledSet(state);
  const rows = state.companies.get(companyId) ?? new Map<string, boolean>();
  const before = companyEnabledSet(state, companyId, instanceSet);
  const options = { withDependencies: request.withDependencies, allowed: instanceSet, companyId };
  const result = resolveScope(before, requested, { ...options, cascade: request.cascade });
  const blocked = [...preBlocked, ...result.blocked];

  const effective: PlanEffect[] = [];
  const push = (key: ModuleKey, to: boolean, cause: ChangeCause) =>
    effective.push({ scope: 'company', companyId, key, from: rows.get(key) ?? null, to, cause });
  for (const key of shutdownOrder(result.offs.keys())) push(key, false, result.offs.get(key) as ChangeCause);
  for (const key of SWITCHABLE_MODULE_KEYS) {
    const cause = result.ons.get(key);
    if (cause) push(key, true, cause);
  }

  const cascadePreview: PlanEffect[] = [];
  if (!request.cascade && result.blocked.some((block) => block.code === 'HAS_DEPENDENTS')) {
    const preview = resolveScope(before, requested, { ...options, cascade: true });
    for (const key of shutdownOrder(preview.offs.keys())) {
      if (preview.offs.get(key) !== 'cascade') continue;
      cascadePreview.push({
        scope: 'company',
        companyId,
        key,
        from: rows.get(key) ?? null,
        to: false,
        cause: 'cascade',
      });
    }
  }

  return {
    applicable: blocked.length === 0,
    effective,
    blocked,
    cascadePreview,
    softImpacts: softImpactsFor(result.offs.keys(), result.set),
    affectedCompanies: sameSet(before, result.set) ? 0 : 1,
  };
}
