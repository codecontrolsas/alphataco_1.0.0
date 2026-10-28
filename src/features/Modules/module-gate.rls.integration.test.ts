import type { PrismaClient } from '@/generated/prisma/client';
import { ensureCity } from '@/test/db-fixtures';
import { createTestEmployee } from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncModuleCatalog } from '../../../scripts/lib/module-control';
import { SWITCHABLE_MODULE_KEYS, UNGATED_TABLES, gatedTables, moduleGateFor } from './catalog';

/**
 * RLS por módulo (F3.4) bajo los roles REALES de la base, con dos empresas A y B:
 * - cobertura: toda tabla con compuerta en el catálogo tiene su política `module_gate` RESTRICTIVA con las claves esperadas,
 *   y ninguna tabla sin compuerta la tiene (atrapa una tabla nueva del catálogo sin lote en las migraciones);
 * - comportamiento: con el módulo apagado solo en A, A ve 0 filas y no puede escribir, B ve todo; apagado en la instancia
 *   da 0 en las dos; `prismaSystem` ve todo; reencender devuelve las filas; los demás módulos no se tocan;
 * - tablas compartidas (`checklist_deviations`: checklists O mantenimiento) y pivotes (`invoice_certifications`);
 * - qué hace Prisma con una relación obligatoria cuyo padre quedó oculto por la compuerta (blueprint §12);
 * - las tablas maestras (empleados, equipos) se siguen escribiendo con todos los módulos con compuerta apagados.
 *
 * El estado de módulos es GLOBAL de la instancia: se guarda al empezar y se restaura al final. Corre con
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

const COMPANY_A = '7c400000-0000-4000-8000-00000000000a';
const COMPANY_B = '7c400000-0000-4000-8000-00000000000b';
const FAKE_EQUIPMENT = '7c400000-0000-4000-8000-0000000000e1';

let owner: PrismaClient;
let snapshot: {
  instance: { module_key: string; enabled: boolean; changed_by: string; reason: string }[];
  company: { company_id: string; module_key: string; enabled: boolean; changed_by: string; reason: string }[];
};

async function setInstance(key: string, enabled: boolean) {
  await owner.instance_modules.upsert({
    where: { module_key: key },
    create: { module_key: key, enabled, changed_by: 'test', reason: 'test' },
    update: { enabled },
  });
}

async function setCompany(companyId: string, key: string, enabled: boolean) {
  await owner.company_modules.upsert({
    where: { company_id_module_key: { company_id: companyId, module_key: key } },
    create: { company_id: companyId, module_key: key, enabled, changed_by: 'test', reason: 'test' },
    update: { enabled },
  });
}

async function resetAllOn() {
  await owner.company_modules.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  for (const key of SWITCHABLE_MODULE_KEYS) await setInstance(key, true);
}

/** Cuerpo de una transacción de la app (rol `alphataco_app`) con la empresa en el contexto. */
async function asApp<T>(
  companyId: string,
  work: (
    tx: Parameters<Parameters<(typeof import('@/shared/lib/prisma'))['prismaBase']['$transaction']>[0]>[0]
  ) => Promise<T>
): Promise<T> {
  const { prismaBase } = await import('@/shared/lib/prisma');
  return prismaBase.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    return work(tx);
  });
}

async function countAs(companyId: string, table: string): Promise<number> {
  return asApp(companyId, async (tx) => {
    const [row] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM public.${table}`);
    return Number(row.n);
  });
}

async function cleanup() {
  const companies = { in: [COMPANY_A, COMPANY_B] };
  await owner.clothing_item_brand_sizes.deleteMany({ where: { company_id: companies } });
  await owner.clothing_items.deleteMany({ where: { company_id: companies } });
  await owner.clothing_sizes.deleteMany({ where: { company_id: companies } });
  await owner.clothing_brands.deleteMany({ where: { company_id: companies } });
  await owner.tire_brands.deleteMany({ where: { company_id: companies } });
  await owner.$executeRaw`DELETE FROM public.checklist_deviations WHERE equipment_id = ${FAKE_EQUIPMENT}::uuid`;
  await owner.employees.deleteMany({ where: { company_id: companies } });
  await owner.company.deleteMany({ where: { id: companies } });
}

describe.skipIf(!RUN_RLS)('RLS por módulo (F3.4) bajo los roles reales', () => {
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
    await createTestCompany(owner, { id: COMPANY_A, name: 'Compuerta A', cuit: '30999999324', cityId: city.id });
    await createTestCompany(owner, { id: COMPANY_B, name: 'Compuerta B', cuit: '30999999332', cityId: city.id });
    await resetAllOn();
    for (const company_id of [COMPANY_A, COMPANY_B]) {
      await owner.tire_brands.create({ data: { name: 'Marca G', company_id } });
      await owner.clothing_brands.create({ data: { name: 'Marca R', company_id } });
    }
    await owner.$transaction(async (tx) => {
      // Sin FK: el equipo real exige una ficha entera que a la compuerta no le importa.
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      for (const company_id of [COMPANY_A, COMPANY_B]) {
        await tx.$executeRaw`INSERT INTO public.checklist_deviations (equipment_id, item_code, item_label, company_id)
          VALUES (${FAKE_EQUIPMENT}::uuid, 'X1', 'Desvío de prueba', ${company_id}::uuid)`;
      }
    });
  });

  beforeEach(resetAllOn);

  afterAll(async () => {
    if (!owner) return;
    await cleanup();
    await owner.instance_modules.deleteMany({});
    if (snapshot.instance.length) await owner.instance_modules.createMany({ data: snapshot.instance });
    if (snapshot.company.length)
      await owner.company_modules.createMany({ data: snapshot.company, skipDuplicates: true });
    await syncModuleCatalog(owner);
    await owner.$disconnect();
  });

  it('toda tabla con compuerta tiene su política module_gate con las claves del catálogo, y solo ellas', async () => {
    const rows = await owner.$queryRaw<{ tablename: string; permissive: string; qual: string; with_check: string }[]>`
      SELECT tablename, permissive, qual, with_check FROM pg_policies
      WHERE schemaname = 'public' AND policyname = 'module_gate'`;
    const byTable = new Map(rows.map((row) => [row.tablename, row]));
    const problems: string[] = [];
    for (const gate of gatedTables()) {
      const policy = byTable.get(gate.table);
      if (!policy) {
        problems.push(`${gate.table}: sin module_gate`);
        continue;
      }
      if (policy.permissive !== 'RESTRICTIVE') problems.push(`${gate.table}: no es RESTRICTIVE`);
      if (policy.qual !== policy.with_check) problems.push(`${gate.table}: USING y WITH CHECK distintos`);
      const [, allList = '', anyList = ''] =
        /app_modules_gate\('\{([^}]*)\}'::text\[\], '\{([^}]*)\}'::text\[\]\)/.exec(policy.qual) ?? [];
      const all = allList.split(',').filter(Boolean).sort();
      const any = anyList.split(',').filter(Boolean).sort();
      if (all.join() !== [...gate.all].sort().join() || any.join() !== [...gate.any].sort().join()) {
        problems.push(`${gate.table}: claves {${all}} / {${any}} en vez de {${gate.all}} / {${gate.any}}`);
      }
    }
    const gated = new Set(gatedTables().map((gate) => gate.table));
    for (const table of byTable.keys())
      if (!gated.has(table)) problems.push(`${table}: tiene module_gate y el catálogo no lo pide`);
    expect(problems).toEqual([]);
  });

  it('las tablas maestras y las sin RLS propia quedan fuera de la compuerta', () => {
    for (const table of ['employees', 'vehicles', 'customers', 'daily_indicators', 'document_types']) {
      expect(moduleGateFor(table), table).toBeNull();
    }
    for (const table of UNGATED_TABLES) expect(moduleGateFor(table), table).toBeNull();
  });

  it('con el módulo apagado solo en A: A ve 0 filas y no escribe, B ve todo, los demás módulos no cambian', async () => {
    expect(await countAs(COMPANY_A, 'tire_brands')).toBe(1);
    await setCompany(COMPANY_A, 'gomeria', false);

    expect(await countAs(COMPANY_A, 'tire_brands')).toBe(0);
    expect(await countAs(COMPANY_B, 'tire_brands')).toBe(1);
    expect(await countAs(COMPANY_A, 'clothing_brands')).toBe(1);

    await expect(
      asApp(COMPANY_A, (tx) => tx.$executeRaw`INSERT INTO public.tire_brands (name) VALUES ('Nueva')`)
    ).rejects.toThrow(/row-level security/);
    const updated = await asApp(COMPANY_A, (tx) => tx.$executeRaw`UPDATE public.tire_brands SET name = 'Cambiada'`);
    const deleted = await asApp(COMPANY_A, (tx) => tx.$executeRaw`DELETE FROM public.tire_brands`);
    expect([updated, deleted]).toEqual([0, 0]);

    // Los datos se conservan: reencender devuelve la fila intacta.
    await setCompany(COMPANY_A, 'gomeria', true);
    expect(await countAs(COMPANY_A, 'tire_brands')).toBe(1);
    const [row] = await owner.tire_brands.findMany({ where: { company_id: COMPANY_A } });
    expect(row.name).toBe('Marca G');
  });

  it('con el módulo apagado en la instancia: 0 en las dos empresas, y el cliente de sistema sigue viendo todo', async () => {
    await setInstance('gomeria', false);
    expect(await countAs(COMPANY_A, 'tire_brands')).toBe(0);
    expect(await countAs(COMPANY_B, 'tire_brands')).toBe(0);
    const { prismaSystem } = await import('@/shared/lib/prisma-system');
    expect(await prismaSystem.tire_brands.count({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } })).toBe(2);
  });

  it('una empresa sin contexto no ve nada (la compuerta no abre lo que la empresa cierra)', async () => {
    const { prismaBase } = await import('@/shared/lib/prisma');
    const [row] = await prismaBase.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.tire_brands`;
    expect(Number(row.n)).toBe(0);
  });

  it('tabla compartida: checklist_deviations se ve con Checklists O Mantenimiento encendido', async () => {
    expect(await countAs(COMPANY_A, 'checklist_deviations')).toBe(1);
    await setCompany(COMPANY_A, 'checklists', false);
    expect(await countAs(COMPANY_A, 'checklist_deviations')).toBe(1);
    await setCompany(COMPANY_A, 'mantenimiento', false);
    expect(await countAs(COMPANY_A, 'checklist_deviations')).toBe(0);
    expect(await countAs(COMPANY_B, 'checklist_deviations')).toBe(1);
    await setCompany(COMPANY_A, 'checklists', true);
    expect(await countAs(COMPANY_A, 'checklist_deviations')).toBe(1);
  });

  it('pivote entre dos módulos: invoice_certifications exige Facturación Y Certificación', async () => {
    const gate = (companyId: string) =>
      asApp(companyId, async (tx) => {
        const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
          SELECT public.app_modules_gate(ARRAY['facturacion', 'certificacion'], '{}') AS ok`;
        return row.ok;
      });
    expect(await gate(COMPANY_A)).toBe(true);
    await setCompany(COMPANY_A, 'certificacion', false);
    expect(await gate(COMPANY_A)).toBe(false);
    expect(await gate(COMPANY_B)).toBe(true);
  });

  it('las tablas maestras se siguen escribiendo con TODOS los módulos con compuerta apagados', async () => {
    for (const key of SWITCHABLE_MODULE_KEYS) {
      if (!['empleados', 'equipos', 'clientes', 'movil'].includes(key)) await setCompany(COMPANY_A, key, false);
    }
    const employeeId = '7c400000-0000-4000-8000-0000000000f1';
    await createTestEmployee(owner, {
      id: employeeId,
      companyId: COMPANY_A,
      seed: 7401,
      lastname: 'Compuerta',
      firstname: 'Prueba',
    });
    const updated = await asApp(COMPANY_A, (tx) =>
      tx.employees.updateMany({ where: { id: employeeId }, data: { lastname: 'Editado' } })
    );
    expect(updated.count).toBe(1);
  });

  it('Prisma ante una relación obligatoria con el padre oculto (§12 del blueprint)', async () => {
    const brand = await owner.clothing_brands.findFirstOrThrow({ where: { company_id: COMPANY_A } });
    const item = await owner.clothing_items.create({ data: { name: 'Casco', company_id: COMPANY_A } });
    const size = await owner.clothing_sizes.create({ data: { name: 'M', company_id: COMPANY_A } });
    await owner.clothing_item_brand_sizes.create({
      data: {
        clothing_item_id: item.id,
        clothing_brand_id: brand.id,
        clothing_size_id: size.id,
        company_id: COMPANY_A,
      },
    });
    // Se saca la compuerta SOLO de la pivote para forzar el caso (el catálogo evita que exista de verdad).
    await owner.$executeRawUnsafe('DROP POLICY module_gate ON public.clothing_item_brand_sizes');
    try {
      await setCompany(COMPANY_A, 'indumentaria', false);
      const result = await asApp(COMPANY_A, (tx) =>
        tx.clothing_item_brand_sizes.findMany({ include: { clothing_brands: true } }).then(
          (rows) => ({ ok: true as const, rows }),
          (error: unknown) => ({ ok: false as const, message: String(error) })
        )
      );
      // Comportamiento de Prisma 7 (medido, §12 del blueprint): NO lanza «Inconsistent query result»; devuelve la fila con
      // la relación OBLIGATORIA en `null`, que el tipo declara no nula. Por eso el catálogo prohíbe este caso (test de
      // FK obligatorias) y las pivotes llevan la compuerta de todas las claves involucradas.
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].clothing_brands).toBeNull();
      }
    } finally {
      await owner.$executeRawUnsafe(
        `SELECT public.app_enable_module_gate('public.clothing_item_brand_sizes', ARRAY['indumentaria']::text[])`
      );
    }
    // Con la compuerta puesta en la pivote el caso no se da: la lista queda vacía y no lanza.
    const rows = await asApp(COMPANY_A, (tx) =>
      tx.clothing_item_brand_sizes.findMany({ include: { clothing_brands: true } })
    );
    expect(rows).toEqual([]);
  });
});
