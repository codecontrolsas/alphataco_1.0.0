import type { PrismaClient } from '@/generated/prisma/client';
import { ensureCity } from '@/test/db-fixtures';
import {
  createTestEmployee,
  createTestUser,
  dropCatalogRows,
  dropTestUsers,
  emptyCatalogRows,
  grantPermissions,
  type CatalogRows,
} from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncModuleCatalog } from '../../../scripts/lib/module-control';

/**
 * Control de módulos (F3.1) bajo los roles REALES de la base, con dos empresas A y B:
 * - las tablas de estado están cerradas para `alphataco_app` (ni lee ni escribe);
 * - `get_user_permissions` excluye las pestañas de un módulo apagado en la instancia o en la empresa, con herencia, y al
 *   reencender devuelve exactamente los mismos permisos;
 * - una empresa nunca enciende lo que la instancia tiene apagado, ni escribiendo la fila a mano;
 * - el apagado con dependientes encendidos se bloquea y no escribe; la cascada es explícita;
 * - concurrencia por versión (`STALE_PLAN`), idempotencia por `Idempotency-Key` y auditoría con quién y cuándo;
 * - sin lecturas cruzadas: con la empresa A en el contexto, la app no puede leer el estado de B;
 * - la API (`PUT /api/admin/v1/modules`) exige el token de escritura.
 *
 * El estado de módulos es GLOBAL de la instancia: la suite lo guarda al empezar y lo restaura al final. Corre con
 * `scripts/test-rls.sh` (en serie).
 */
vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));

const COMPANY_A = '7c300000-0000-4000-8000-00000000000a';
const COMPANY_B = '7c300000-0000-4000-8000-00000000000b';
const USER = '7c300000-0000-4000-8000-0000000001a1';
const ACTOR = 'operador@modulos.test';
const KEYS = [
  'mantenimiento:workshop_view:view',
  'mantenimiento:gomeria:view',
  'mantenimiento:ordenes_gomeria:view',
  'hse:documentos-hse:view',
  'empleados:employees:view',
];

let owner: PrismaClient;
const created: CatalogRows = emptyCatalogRows();
let snapshot: {
  instance: { module_key: string; enabled: boolean; changed_by: string; reason: string }[];
  company: { company_id: string; module_key: string; enabled: boolean; changed_by: string; reason: string }[];
};
const requestIds: string[] = [];

/** `get_user_permissions` como lo pide la web: rol de la app y la empresa en el contexto de la transacción. */
async function permissionsAs(companyId: string): Promise<string[]> {
  const { prismaBase } = await import('@/shared/lib/prisma');
  const rows = await prismaBase.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${USER}, true)`;
    return tx.$queryRaw<{ key: string }[]>`
      SELECT module_slug || ':' || tab_slug || ':' || action_slug AS key
      FROM public.get_user_permissions(${USER}::uuid, ${companyId}::uuid)`;
  });
  return rows.map((row) => row.key).sort();
}

async function enabledAs(contextCompany: string, asked: string): Promise<string[]> {
  const { prismaBase } = await import('@/shared/lib/prisma');
  const [row] = await prismaBase.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${contextCompany}, true)`;
    return tx.$queryRaw<{ keys: string[] }[]>`SELECT public.app_enabled_modules(${asked}::uuid) AS keys`;
  });
  return row.keys;
}

async function apply(body: Record<string, unknown>) {
  const { applyModuleChanges, previewModuleChanges } = await import('@/features/AdminApi/lib/modules.server');
  const requestId = crypto.randomUUID();
  requestIds.push(requestId);
  const base = { companyId: null, cascade: false, withDependencies: false, ...body } as Parameters<
    typeof previewModuleChanges
  >[0];
  const plan = await previewModuleChanges(base);
  const outcome = await applyModuleChanges(
    { ...base, expectedStateVersion: plan.stateVersion, reason: 'Prueba de integración de módulos' },
    { requestId, actorEmail: ACTOR }
  );
  return { plan, outcome, requestId };
}

async function resetAllOn(): Promise<void> {
  const { SWITCHABLE_MODULE_KEYS } = await import('./catalog');
  await owner.company_modules.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  for (const key of SWITCHABLE_MODULE_KEYS) {
    await owner.instance_modules.upsert({
      where: { module_key: key },
      create: { module_key: key, enabled: true, changed_by: 'test', reason: 'test' },
      update: { enabled: true },
    });
  }
}

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.hse_documents.deleteMany({ where: { company_id: { in: companies } } });
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await owner.document_types.deleteMany({ where: { company_id: { in: companies } } });
  await owner.module_change_log.deleteMany({ where: { actor_email: ACTOR } });
  await owner.user_permissions.deleteMany({ where: { user_id: USER } });
  await dropTestUsers(owner, [USER]);
  await owner.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
}

describe.skipIf(!RUN_RLS)('control de módulos bajo los roles reales', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    snapshot = {
      instance: await owner.instance_modules.findMany({
        select: { module_key: true, enabled: true, changed_by: true, reason: true },
      }),
      company: await owner.company_modules.findMany({
        select: { company_id: true, module_key: true, enabled: true, changed_by: true, reason: true },
      }),
    };
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY_A, name: 'Módulos A', cuit: '30999999308', cityId: city.id });
    await createTestCompany(owner, { id: COMPANY_B, name: 'Módulos B', cuit: '30999999316', cityId: city.id });
    await createTestUser(owner, { id: USER, email: 'usuario@modulos.test', fullname: 'Usuario Módulos' });
    for (const companyId of [COMPANY_A, COMPANY_B]) {
      await owner.share_company_users.create({ data: { company_id: companyId, profile_id: USER } });
      await grantPermissions(owner, created, { userId: USER, companyId, keys: KEYS });
    }
    // Las pestañas pueden haberlas creado los fixtures recién: la pertenencia se sincroniza después.
    await syncModuleCatalog(owner);
  });

  beforeEach(resetAllOn);

  afterAll(async () => {
    if (!owner) return;
    await cleanup();
    await dropCatalogRows(owner, created);
    await owner.instance_modules.deleteMany({});
    if (snapshot.instance.length) await owner.instance_modules.createMany({ data: snapshot.instance });
    if (snapshot.company.length)
      await owner.company_modules.createMany({ data: snapshot.company, skipDuplicates: true });
    await syncModuleCatalog(owner);
    await owner.$disconnect();
  });

  it('la app no lee ni escribe las tablas de estado', async () => {
    const { prismaBase } = await import('@/shared/lib/prisma');
    for (const table of ['instance_modules', 'company_modules', 'module_change_log', 'module_tab_owners']) {
      await expect(prismaBase.$queryRawUnsafe(`SELECT 1 FROM public.${table} LIMIT 1`)).rejects.toThrow(
        /permission denied/
      );
    }
    await expect(
      prismaBase.$executeRawUnsafe(
        `INSERT INTO public.instance_modules (module_key, enabled, changed_by, reason) VALUES ('gomeria', true, 'x', 'x')`
      )
    ).rejects.toThrow(/permission denied/);
  });

  it('apagar en la instancia saca las pestañas (con herencia) en las dos empresas, y reencender las devuelve iguales', async () => {
    const before = await permissionsAs(COMPANY_A);
    expect(before).toEqual(
      expect.arrayContaining(['mantenimiento:gomeria:view', 'mantenimiento:ordenes_gomeria:view'])
    );

    const { outcome } = await apply({ scope: 'instance', changes: [{ key: 'gomeria', enabled: false }] });
    expect(outcome.status).toBe('applied');
    for (const companyId of [COMPANY_A, COMPANY_B]) {
      const after = await permissionsAs(companyId);
      expect(after).not.toContain('mantenimiento:gomeria:view');
      expect(after).not.toContain('mantenimiento:ordenes_gomeria:view');
      expect(after).toContain('mantenimiento:workshop_view:view');
    }

    await apply({ scope: 'instance', changes: [{ key: 'gomeria', enabled: true }] });
    expect(await permissionsAs(COMPANY_A)).toEqual(before);
  });

  it('apagar en la empresa A deja a la B intacta', async () => {
    // El portal depende de HSE: se apagan los dos (si no, el plan lo bloquea).
    const { outcome } = await apply({
      scope: 'company',
      companyId: COMPANY_A,
      changes: [
        { key: 'portal', enabled: false },
        { key: 'hse', enabled: false },
      ],
    });
    expect(outcome.status).toBe('applied');
    expect(await permissionsAs(COMPANY_A)).not.toContain('hse:documentos-hse:view');
    expect(await permissionsAs(COMPANY_B)).toContain('hse:documentos-hse:view');
    expect(await enabledAs(COMPANY_A, COMPANY_A)).not.toContain('hse');
    expect(await enabledAs(COMPANY_B, COMPANY_B)).toContain('hse');
  });

  it('la empresa nunca enciende más que la instancia (ni con la fila escrita a mano)', async () => {
    await apply({ scope: 'instance', changes: [{ key: 'portal', enabled: false }] });
    const { outcome } = await apply({ scope: 'instance', changes: [{ key: 'hse', enabled: false }] });
    expect(outcome.status).toBe('applied');

    const blocked = await apply({ scope: 'company', companyId: COMPANY_A, changes: [{ key: 'hse', enabled: true }] });
    expect(blocked.outcome.status).toBe('blocked');
    expect(blocked.plan.blocked).toEqual([{ key: 'hse', code: 'INSTANCE_DISABLED', companyId: COMPANY_A }]);

    await owner.company_modules.create({
      data: { company_id: COMPANY_A, module_key: 'hse', enabled: true, changed_by: 'manual', reason: 'manual' },
    });
    expect(await enabledAs(COMPANY_A, COMPANY_A)).not.toContain('hse');
    expect(await permissionsAs(COMPANY_A)).not.toContain('hse:documentos-hse:view');
  });

  it('el apagado con dependientes encendidos se bloquea y no escribe; con cascade apaga todo, auditado', async () => {
    const { plan, outcome, requestId } = await apply({
      scope: 'instance',
      changes: [{ key: 'mantenimiento', enabled: false }],
    });
    expect(outcome.status).toBe('blocked');
    expect(plan.blocked[0]).toMatchObject({ key: 'mantenimiento', code: 'HAS_DEPENDENTS', dependents: ['gomeria'] });
    expect(await owner.instance_modules.findUnique({ where: { module_key: 'mantenimiento' } })).toMatchObject({
      enabled: true,
    });
    expect(await owner.module_change_log.count({ where: { request_id: requestId } })).toBe(0);

    const cascade = await apply({
      scope: 'instance',
      changes: [{ key: 'mantenimiento', enabled: false }],
      cascade: true,
    });
    expect(cascade.outcome.status).toBe('applied');
    const log = await owner.module_change_log.findMany({ where: { request_id: cascade.requestId } });
    expect(log.map((row) => [row.module_key, row.cause]).sort()).toEqual([
      ['gomeria', 'cascade'],
      ['mantenimiento', 'requested'],
    ]);
    expect(log.every((row) => row.actor_email === ACTOR && row.origin === 'taskapp' && row.to_enabled === false)).toBe(
      true
    );
    expect(await permissionsAs(COMPANY_A)).not.toContain('mantenimiento:workshop_view:view');
  });

  it('versión vieja da STALE_PLAN y un reintento con la misma clave no vuelve a escribir', async () => {
    const { applyModuleChanges, previewModuleChanges } = await import('@/features/AdminApi/lib/modules.server');
    const request = {
      scope: 'instance' as const,
      companyId: null,
      changes: [{ key: 'formularios', enabled: false }],
      cascade: false,
      withDependencies: false,
    };
    const plan = await previewModuleChanges(request);
    await apply({ scope: 'instance', changes: [{ key: 'gomeria', enabled: false }] });

    const staleId = crypto.randomUUID();
    const stale = await applyModuleChanges(
      { ...request, expectedStateVersion: plan.stateVersion, reason: 'Prueba de concurrencia' },
      { requestId: staleId, actorEmail: ACTOR }
    );
    expect(stale.status).toBe('stale');

    const fresh = await previewModuleChanges(request);
    const id = crypto.randomUUID();
    const first = await applyModuleChanges(
      { ...request, expectedStateVersion: fresh.stateVersion, reason: 'Prueba de idempotencia' },
      { requestId: id, actorEmail: ACTOR }
    );
    const second = await applyModuleChanges(
      { ...request, expectedStateVersion: fresh.stateVersion, reason: 'Prueba de idempotencia' },
      { requestId: id, actorEmail: ACTOR }
    );
    expect(first).toMatchObject({ status: 'applied', replayed: false });
    expect(second).toMatchObject({ status: 'applied', replayed: true });
    expect(await owner.module_change_log.count({ where: { request_id: id } })).toBe(1);
  });

  it('sin lecturas cruzadas: con A en el contexto, la app no ve el estado de B', async () => {
    await apply({ scope: 'company', companyId: COMPANY_B, changes: [{ key: 'gomeria', enabled: false }] });
    expect(await enabledAs(COMPANY_A, COMPANY_B)).toEqual(['nucleo']);
    expect(await enabledAs(COMPANY_B, COMPANY_B)).not.toContain('gomeria');
    expect(await enabledAs(COMPANY_B, COMPANY_B)).toContain('mantenimiento');
    // El helper de servidor (rol de sistema) sí, porque la empresa se la pasa código de servidor.
    const { getEnabledModulesFor } = await import('./server/modules.server');
    expect((await getEnabledModulesFor(COMPANY_B)).has('gomeria')).toBe(false);
    expect((await getEnabledModulesFor(COMPANY_A)).has('gomeria')).toBe(true);
  });

  it('la API exige el token de escritura, valida el pedido y no devuelve secretos', async () => {
    const { GET, PUT } = await import('@/app/api/admin/v1/modules/route');
    vi.stubEnv('ADMIN_MODULES_TOKEN', 'token-de-escritura-de-prueba');
    vi.stubEnv('ADMIN_STATUS_TOKEN', 'token-de-lectura-de-prueba');
    try {
      const url = 'http://localhost/api/admin/v1/modules';
      const read = await GET(new Request(url, { headers: { authorization: 'Bearer token-de-lectura-de-prueba' } }));
      expect(read.status).toBe(200);
      const listing = await read.json();
      expect(listing.modules.find((m: { key: string }) => m.key === 'gomeria').requires).toEqual(
        expect.arrayContaining(['mantenimiento', 'almacenes'])
      );
      expect(JSON.stringify(listing)).not.toContain('token-de');

      const body = JSON.stringify({
        scope: 'instance',
        changes: [{ key: 'gomeria', enabled: false }],
        expectedStateVersion: listing.stateVersion,
        reason: 'Prueba por la API',
      });
      const headers = {
        'x-actor-email': ACTOR,
        'idempotency-key': crypto.randomUUID(),
        'content-type': 'application/json',
      };
      const withReadToken = await PUT(
        new Request(url, {
          method: 'PUT',
          body,
          headers: { ...headers, authorization: 'Bearer token-de-lectura-de-prueba' },
        })
      );
      expect(withReadToken.status).toBe(401);
      const noReason = await PUT(
        new Request(url, {
          method: 'PUT',
          body: JSON.stringify({ ...JSON.parse(body), reason: '' }),
          headers: { ...headers, authorization: 'Bearer token-de-escritura-de-prueba' },
        })
      );
      expect(noReason.status).toBe(400);
      const ok = await PUT(
        new Request(url, {
          method: 'PUT',
          body,
          headers: { ...headers, authorization: 'Bearer token-de-escritura-de-prueba' },
        })
      );
      expect(ok.status).toBe(200);
      expect((await ok.json()).applied).toEqual([
        { scope: 'instance', companyId: null, key: 'gomeria', from: true, to: false, cause: 'requested' },
      ]);
      const stale = await PUT(
        new Request(url, {
          method: 'PUT',
          body,
          headers: {
            ...headers,
            'idempotency-key': crypto.randomUUID(),
            authorization: 'Bearer token-de-escritura-de-prueba',
          },
        })
      );
      expect(stale.status).toBe(409);
      expect((await stale.json()).error.code).toBe('STALE_PLAN');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('con documentación o HSE apagados el caché derivado se congela y al encender se reconcilia (F3.2)', async () => {
    const EMPLOYEE = '7c300000-0000-4000-8000-0000000002e1';
    const DOC = '7c300000-0000-4000-8000-000000000501';
    const VERSION = '7c300000-0000-4000-8000-000000000511';
    await createTestEmployee(owner, {
      id: EMPLOYEE,
      companyId: COMPANY_A,
      seed: 71,
      lastname: 'Modulos',
      firstname: 'Cache',
    });
    await owner.document_types.create({
      data: {
        applies: 'Persona',
        name: 'Tipo obligatorio F3.2',
        company_id: COMPANY_A,
        mandatory: true,
        multiresource: false,
        explired: false,
        special: false,
      },
    });
    await owner.hse_documents.create({
      data: { id: DOC, company_id: COMPANY_A, title: 'Norma F3.2', created_by: USER },
    });
    await owner.hse_document_versions.create({
      data: {
        id: VERSION,
        company_id: COMPANY_A,
        document_id: DOC,
        version: 1,
        file_path: `${COMPANY_A}/documents/${VERSION}/norma.pdf`,
        file_name: 'norma.pdf',
        file_size: 3,
        file_sha256: 'a'.repeat(64),
        created_by: USER,
      },
    });
    await owner.hse_document_targets.create({ data: { company_id: COMPANY_A, document_id: DOC, kind: 'all' } });
    await owner.hse_documents.update({
      where: { id: DOC },
      data: { current_version_id: VERSION, status: 'published' },
    });
    await owner.$executeRaw`UPDATE employees SET status = 'Avalado'::status_type WHERE id = ${EMPLOYEE}::uuid`;

    const statusOf = async () =>
      (await owner.$queryRaw<{ s: string }[]>`SELECT status::text AS s FROM employees WHERE id = ${EMPLOYEE}::uuid`)[0]
        ?.s;
    const acks = () => owner.hse_document_acknowledgements.count({ where: { company_id: COMPANY_A } });

    const off = await apply({
      scope: 'company',
      companyId: COMPANY_A,
      cascade: true, // Selección depende de Documentación
      changes: [
        { key: 'documentacion', enabled: false },
        { key: 'portal', enabled: false },
        { key: 'hse', enabled: false },
      ],
    });
    expect(off.outcome.status).toBe('applied');

    const { prisma } = await import('@/shared/lib/prisma');
    const { runInCompanyScope } = await import('@/shared/lib/tenant-context');
    const { refreshDocumentStatus } = await import(
      '@/features/Documentacion/shared/compliance/server/document-status.server'
    );
    const { syncHseAcknowledgements } = await import('@/features/Hse/use-cases/sync-acknowledgements');
    await runInCompanyScope(COMPANY_A, () =>
      prisma.$transaction(async (tx) => {
        expect(await refreshDocumentStatus(tx, 'Persona', { companyId: COMPANY_A })).toEqual({
          evaluated: 0,
          changed: 0,
        });
        await syncHseAcknowledgements(tx, { companyId: COMPANY_A, employeeId: EMPLOYEE });
      })
    );
    expect(await statusOf()).toBe('Avalado');
    expect(await acks()).toBe(0);

    const on = await apply({
      scope: 'company',
      companyId: COMPANY_A,
      changes: [
        { key: 'documentacion', enabled: true },
        { key: 'hse', enabled: true },
        { key: 'portal', enabled: true },
      ],
    });
    expect(on.outcome.status).toBe('applied');
    const { runReconcileOnEnable } = await import('./server/reconcile.server');
    const applied = on.outcome.status === 'applied' ? on.outcome.applied : [];
    const results = await runReconcileOnEnable(applied);
    expect(results.sort()).toEqual([`reconcile-documents:${COMPANY_A}:ok`, `reconcile-hse:${COMPANY_A}:ok`]);
    expect(await statusOf()).toBe('Incompleto');
    expect(await acks()).toBe(1);
  });
});
