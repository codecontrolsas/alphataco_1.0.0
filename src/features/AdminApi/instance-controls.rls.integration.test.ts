import type { PrismaClient } from '@/generated/prisma/client';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles } from '@/test/rls-roles';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Controles de instancia (`/api/admin/v1/instance`) bajo los roles REALES: el rol de sistema aplica los cambios con
 * versión, idempotencia y auditoría; la app (`alphataco_app`) no escribe la configuración, no ve la auditoría y no
 * puede borrar empresas. El límite de empresas no baja de las que existen.
 *
 * `instance_settings` es global: la suite guarda las filas que toca y las restaura. Corre con `scripts/test-rls.sh`.
 */
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));

const KEYS = ['max_companies', 'instance_pause', 'banner_login', 'banner_dashboard'];
const ACTOR = 'soporte@rls-instancia.test';

let owner: PrismaClient;
let saved: { key: string; value: unknown; description: string | null }[] = [];
const requestIds: string[] = [];

function newRequestId(): string {
  const id = randomUUID();
  requestIds.push(id);
  return id;
}

async function restoreSettings(): Promise<void> {
  await owner.instance_settings.deleteMany({ where: { key: { in: KEYS } } });
  for (const row of saved) {
    await owner.instance_settings.create({
      data: { key: row.key, value: row.value as never, description: row.description },
    });
  }
}

describe.skipIf(!RUN_RLS)('controles de instancia (roles reales)', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    saved = await owner.instance_settings.findMany({
      where: { key: { in: KEYS } },
      select: { key: true, value: true, description: true },
    });
  }, 60_000);

  afterAll(async () => {
    await restoreSettings();
    // La auditoría es solo de alta para los roles de la app; el dueño limpia lo de la suite.
    await owner.instance_change_log.deleteMany({ where: { request_id: { in: requestIds } } });
    await owner.$disconnect();
  });

  it('la app no escribe los controles, no ve la auditoría y no puede borrar empresas', async () => {
    const { prismaBase } = await import('@/shared/lib/prisma');
    await expect(
      prismaBase.instance_settings.update({ where: { key: 'instance_pause' }, data: { value: { active: true } } })
    ).rejects.toThrow(/permission denied/);
    await expect(prismaBase.instance_change_log.findMany({ take: 1 })).rejects.toThrow(/permission denied/);
    await expect(
      prismaBase.instance_change_log.create({
        data: {
          request_id: randomUUID(),
          field: 'pause.active',
          actor_email: 'x@x.test',
          origin: 'taskapp',
          reason: 'x',
        },
      })
    ).rejects.toThrow(/permission denied/);
    await expect(prismaBase.company.deleteMany({ where: { id: randomUUID() } })).rejects.toThrow(/permission denied/);
  });

  it('aplica pausa y banners con versión, auditoría e idempotencia; la lectura de la app lo ve', async () => {
    const { applyInstanceChanges, getInstanceOverview, getInstanceChangeLog } = await import('./lib/instance.server');
    const { getInstanceControlsCached } = await import('@/shared/lib/instance-controls');

    const before = await getInstanceOverview();
    const requestId = newRequestId();
    const body = {
      expectedVersion: before.version,
      reason: 'Ventana de mantenimiento de prueba',
      pause: { active: true, message: 'Volvemos a las 16 h' },
      banners: { dashboard: { enabled: true, message: 'Corte programado 22 h', severity: 'critical' as const } },
    };

    const applied = await applyInstanceChanges(body, { requestId, actorEmail: ACTOR });
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') return;
    expect(applied.replayed).toBe(false);
    expect(applied.state.pause).toMatchObject({ active: true, message: 'Volvemos a las 16 h' });
    expect(applied.state.pause.since).not.toBeNull();
    expect(applied.state.version).not.toBe(before.version);
    expect(applied.changes.map((c) => c.field)).toEqual(
      expect.arrayContaining(['pause.active', 'banners.dashboard.enabled', 'banners.dashboard.severity'])
    );

    // La app (proxy, Server Components) lo lee con el cliente de sistema; el proceso que aplicó invalidó su caché.
    await expect(getInstanceControlsCached()).resolves.toMatchObject({
      pause: { active: true, message: 'Volvemos a las 16 h' },
      banners: { dashboard: { enabled: true, severity: 'critical' } },
    });

    // Auditoría: una fila por campo, con quién y por qué.
    const log = await getInstanceChangeLog({ limit: 50 });
    const entry = log.requests.find((r) => r.requestId === requestId);
    expect(entry).toMatchObject({ actorEmail: ACTOR, origin: 'taskapp', reason: 'Ventana de mantenimiento de prueba' });
    expect(entry?.changes).toHaveLength(applied.changes.length);

    // Reintento con la misma clave: devuelve lo aplicado sin escribir de nuevo (aunque la versión ya no coincida).
    const replay = await applyInstanceChanges(body, { requestId, actorEmail: ACTOR });
    expect(replay).toMatchObject({ status: 'applied', replayed: true });
    await expect(owner.instance_change_log.count({ where: { request_id: requestId } })).resolves.toBe(
      applied.changes.length
    );

    // Otra clave con la versión vieja: STALE_PLAN.
    const stale = await applyInstanceChanges(
      { ...body, pause: { active: false } },
      { requestId: newRequestId(), actorEmail: ACTOR }
    );
    expect(stale).toEqual({ status: 'stale', version: applied.state.version });

    // Reanudar: `since` vuelve a null.
    const resumed = await applyInstanceChanges(
      { expectedVersion: applied.state.version, reason: 'Fin de la ventana', pause: { active: false } },
      { requestId: newRequestId(), actorEmail: ACTOR }
    );
    expect(resumed.status === 'applied' && resumed.state.pause).toMatchObject({ active: false, since: null });
  });

  it('valida el estado resultante y no deja el límite por debajo de las empresas existentes', async () => {
    const { applyInstanceChanges, getInstanceOverview } = await import('./lib/instance.server');
    const current = await getInstanceOverview();

    const noMessage = await applyInstanceChanges(
      { expectedVersion: current.version, reason: 'Sin mensaje', banners: { login: { enabled: true, message: '' } } },
      { requestId: newRequestId(), actorEmail: ACTOR }
    );
    expect(noMessage.status).toBe('invalid');

    const total = current.limits.companies_total;
    if (total >= 2) {
      const below = await applyInstanceChanges(
        { expectedVersion: current.version, reason: 'Bajar el límite', max_companies: total - 1 },
        { requestId: newRequestId(), actorEmail: ACTOR }
      );
      expect(below).toEqual({ status: 'below_companies', maxCompanies: total - 1, companiesTotal: total });
    }

    const target = Math.max(total, 1) + 1;
    const raised = await applyInstanceChanges(
      { expectedVersion: current.version, reason: 'Subir el límite', max_companies: target },
      { requestId: newRequestId(), actorEmail: ACTOR }
    );
    expect(raised.status === 'applied' && raised.state.limits).toEqual({
      max_companies: target,
      companies_total: total,
      companies_limit_reached: false,
    });
    await expect(owner.instance_settings.findUnique({ where: { key: 'max_companies' } })).resolves.toMatchObject({
      value: target,
    });

    if (raised.status !== 'applied') return;
    // Igual al número de empresas sí se puede (el alta queda cerrada).
    const atTotal = await applyInstanceChanges(
      { expectedVersion: raised.state.version, reason: 'Al tope', max_companies: Math.max(total, 1) },
      { requestId: newRequestId(), actorEmail: ACTOR }
    );
    expect(atTotal.status).toBe('applied');
  });
});
