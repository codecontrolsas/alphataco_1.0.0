import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { invalidateInstanceControls, readInstanceControls } from '@/shared/lib/instance-controls';
import {
  INSTANCE_CONTROL_KEYS,
  computeInstanceVersion,
  type InstanceEditableState,
} from '@/shared/lib/instance-controls-core';
import { COMPANY_LIMIT_LOCK_KEY, INSTANCE_SETTING_KEYS, readMaxCompanies } from '@/shared/lib/instance-settings';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { INSTANCE_FIELDS, type InstanceField, type InstanceUpdateRequest } from '../schemas/instance';
import { computeInstancePlan, isBelowExistingCompanies, type InstanceChange } from './instance-plan';

/**
 * Lectura y aplicación de los controles de instancia para la API de administración (`/api/admin/v1/instance`). Todo
 * con el cliente de sistema: la app no puede escribir `instance_settings` ni ver la auditoría.
 */

const logger = new Logger('features/AdminApi/instance');

/** Serializa los cambios de controles entre sí (dos PUT con la misma versión: el segundo ve STALE_PLAN). */
const INSTANCE_LOCK_KEY = 'alphataco:instance-controls';

type Db = Pick<Prisma.TransactionClient, 'instance_settings' | 'company'>;

async function readEditableState(db: Db): Promise<InstanceEditableState> {
  const [maxCompanies, controls] = await Promise.all([readMaxCompanies(db), readInstanceControls(db)]);
  return { maxCompanies, ...controls };
}

function toStateResponse(state: InstanceEditableState, companiesTotal: number) {
  return {
    version: computeInstanceVersion(state),
    limits: {
      max_companies: state.maxCompanies,
      companies_total: companiesTotal,
      companies_limit_reached: companiesTotal >= state.maxCompanies,
    },
    pause: { active: state.pause.active, message: state.pause.message, since: state.pause.since },
    banners: { login: { ...state.banners.login }, dashboard: { ...state.banners.dashboard } },
  };
}

export type InstanceStateResponse = ReturnType<typeof toStateResponse>;

/** Estado actual (lo que devuelve `GET /instance`). */
export async function getInstanceOverview(): Promise<InstanceStateResponse> {
  const [state, companiesTotal] = await Promise.all([readEditableState(prismaSystem), prismaSystem.company.count()]);
  return toStateResponse(state, companiesTotal);
}

/** Resumen para `/api/admin/v1/status` (`instance_state`): sin los textos, que se leen por `GET /instance`. */
export async function getInstanceStateSummary() {
  const state = await readEditableState(prismaSystem);
  return {
    version: computeInstanceVersion(state),
    max_companies: state.maxCompanies,
    pause_active: state.pause.active,
    pause_since: state.pause.since,
    banner_login_enabled: state.banners.login.enabled,
    banner_login_severity: state.banners.login.severity,
    banner_dashboard_enabled: state.banners.dashboard.enabled,
    banner_dashboard_severity: state.banners.dashboard.severity,
  };
}

export type InstanceApplyOutcome =
  | {
      status: 'applied';
      requestId: string;
      replayed: boolean;
      changes: InstanceChange[];
      state: InstanceStateResponse;
    }
  | { status: 'stale'; version: string }
  | { status: 'invalid'; message: string }
  | { status: 'below_companies'; maxCompanies: number; companiesTotal: number };

const isInstanceField = (value: string): value is InstanceField =>
  (INSTANCE_FIELDS as readonly string[]).includes(value);

type ChangeValue = InstanceChange['from'];

function fromJson(value: Prisma.JsonValue | null): ChangeValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
}

function toJson(value: ChangeValue): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value;
}

/** Filas de `instance_settings` a escribir según los campos que cambiaron. */
function settingsWrites(next: InstanceEditableState, changes: InstanceChange[]) {
  const touched = new Set(changes.map((change) => change.field.split('.').slice(0, 2).join('.')));
  const writes: { key: string; value: Prisma.InputJsonValue }[] = [];
  if (touched.has('max_companies')) writes.push({ key: INSTANCE_SETTING_KEYS.maxCompanies, value: next.maxCompanies });
  if (touched.has('pause.active') || touched.has('pause.message')) {
    writes.push({ key: INSTANCE_CONTROL_KEYS.pause, value: { ...next.pause } });
  }
  if ([...touched].some((field) => field.startsWith('banners.login'))) {
    writes.push({ key: INSTANCE_CONTROL_KEYS.loginBanner, value: { ...next.banners.login } });
  }
  if ([...touched].some((field) => field.startsWith('banners.dashboard'))) {
    writes.push({ key: INSTANCE_CONTROL_KEYS.dashboardBanner, value: { ...next.banners.dashboard } });
  }
  return writes;
}

/**
 * Aplica un cambio dentro de una transacción con lock: exige la versión que vio el operador (`STALE_PLAN` si no),
 * valida el estado resultante, no deja el límite por debajo de las empresas existentes, escribe las claves y una fila
 * de auditoría por campo. `requestId` (= `Idempotency-Key`): un reintento con la misma clave devuelve lo ya aplicado.
 *
 * Toma también el lock del alta de empresas: un alta simultánea no puede pasar el límite que se está bajando.
 */
export async function applyInstanceChanges(
  request: InstanceUpdateRequest,
  meta: { requestId: string; actorEmail: string }
): Promise<InstanceApplyOutcome> {
  const outcome = await prismaSystem.$transaction(
    async (tx): Promise<InstanceApplyOutcome> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${INSTANCE_LOCK_KEY}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${COMPANY_LIMIT_LOCK_KEY}))`;

      const [previous, state, companiesTotal] = await Promise.all([
        tx.instance_change_log.findMany({ where: { request_id: meta.requestId }, orderBy: { created_at: 'asc' } }),
        readEditableState(tx),
        tx.company.count(),
      ]);

      if (previous.length > 0) {
        return {
          status: 'applied',
          requestId: meta.requestId,
          replayed: true,
          changes: previous.flatMap((row) =>
            isInstanceField(row.field)
              ? [{ field: row.field, from: fromJson(row.from_value), to: fromJson(row.to_value) }]
              : []
          ),
          state: toStateResponse(state, companiesTotal),
        };
      }

      const version = computeInstanceVersion(state);
      if (version !== request.expectedVersion) return { status: 'stale', version };

      const plan = computeInstancePlan(state, request, new Date());
      if (!plan.ok) return { status: 'invalid', message: plan.message };
      if (request.max_companies !== undefined && isBelowExistingCompanies(plan.next.maxCompanies, companiesTotal)) {
        return { status: 'below_companies', maxCompanies: plan.next.maxCompanies, companiesTotal };
      }

      const now = new Date();
      for (const write of settingsWrites(plan.next, plan.changes)) {
        await tx.instance_settings.upsert({
          where: { key: write.key },
          create: { key: write.key, value: write.value, updated_at: now },
          update: { value: write.value, updated_at: now },
        });
      }
      if (plan.changes.length > 0) {
        await tx.instance_change_log.createMany({
          data: plan.changes.map((change) => ({
            request_id: meta.requestId,
            field: change.field,
            from_value: toJson(change.from),
            to_value: toJson(change.to),
            actor_email: meta.actorEmail,
            origin: 'taskapp',
            reason: request.reason,
          })),
        });
      }
      logger.info('Cambio de controles de instancia aplicado', {
        data: { requestId: meta.requestId, fields: plan.changes.map((c) => c.field), actor: meta.actorEmail },
      });
      return {
        status: 'applied',
        requestId: meta.requestId,
        replayed: false,
        changes: plan.changes,
        state: toStateResponse(plan.next, companiesTotal),
      };
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
  // Este proceso ve el cambio en el request siguiente; los demás, al vencer el TTL de `instance-controls`.
  if (outcome.status === 'applied' && !outcome.replayed) invalidateInstanceControls();
  return outcome;
}

/** Historial de cambios agrupado por pedido (los más nuevos primero): `?limit=50&before=<iso>`. */
export async function getInstanceChangeLog(query: { limit: number; before?: string }) {
  const rows = await prismaSystem.instance_change_log.findMany({
    where: query.before ? { created_at: { lt: new Date(query.before) } } : undefined,
    orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    take: query.limit,
  });
  const groups = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) groups.set(row.request_id, [...(groups.get(row.request_id) ?? []), row]);
  return {
    requests: [...groups.entries()].map(([requestId, items]) => ({
      requestId,
      createdAt: items[0].created_at.toISOString(),
      actorEmail: items[0].actor_email,
      origin: items[0].origin,
      reason: items[0].reason,
      changes: items.flatMap((item) =>
        isInstanceField(item.field)
          ? [{ field: item.field, from: fromJson(item.from_value), to: fromJson(item.to_value) }]
          : []
      ),
    })),
    nextBefore: rows.length === query.limit ? rows[rows.length - 1].created_at.toISOString() : null,
  };
}
