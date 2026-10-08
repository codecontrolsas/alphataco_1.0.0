/**
 * Reset diario de la demo: borra los datos de negocio de la empresa demo y los vuelve a
 * generar con fechas relativas a hoy (hora argentina), asi la demo siempre esta "viva".
 *
 * Uso (dentro del contenedor de la app, que tiene DATABASE_URL y S3_*):
 *   DEMO_RESET_ENABLED=true node scripts/demo/reset.ts [--dry]
 *
 * - Todo va en UNA transaccion: si algo falla, la demo queda como estaba (la de ayer).
 * - `--dry` genera todo y hace ROLLBACK al final, sin subir archivos: sirve para probar.
 * - Guardas: sin `DEMO_RESET_ENABLED=true` no hace nada, y aborta si la base tiene otra
 *   empresa ademas de la demo o si la empresa no se llama como la demo.
 *
 * Lo corre un Schedule de Dokploy a las 00:05 (antes del job de indicadores de las 00:30).
 * Ver docs/deploy/runbook.md, "Instancia demo: reset diario".
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.ts';
import type { Ctx } from './lib/ctx.ts';
import { argentinaToday, buildCalendar } from './lib/dates.ts';
import { createFaker } from './lib/random.ts';
import { assertDemoDatabase, wipeBusinessData } from './lib/wipe.ts';
import { createS3, ensureBuckets, pruneObjects, uploadAll } from './lib/storage.ts';
import { COMPANY_PROFILE } from './data/catalog.ts';
import { seedCatalogs } from './domains/catalogs.ts';
import { linkPriceRules, seedCustomers, seedPriceRules } from './domains/customers.ts';
import { seedEmployees } from './domains/employees.ts';
import { seedFiscalProfile } from './domains/fiscal.ts';
import { seedVehicles } from './domains/vehicles.ts';
import { seedDocuments } from './domains/documents.ts';
import { DOCUMENT_BUCKET, REMIT_BUCKET, REMIT_PREFIX, companyFolder } from './lib/paths.ts';
import { buildDiagramGrid, seedDiagrams } from './domains/diagrams.ts';
import { seedOperations } from './domains/operations.ts';
import { seedMaintenance } from './domains/maintenance.ts';
import { seedCertifications } from './domains/commercial.ts';
import { seedCandidates, seedClothing, seedKpis } from './domains/hr.ts';
import { seedTires } from './domains/tires.ts';
import { seedWarehouses } from './domains/warehouses.ts';
import { seedUsers } from './domains/users.ts';
import { seedIndicators } from './domains/indicators.ts';

/** Empresa de la demo (la creo seed-company con SEED_COMPANY_NAME="Empresa Demo"). */
const DEMO_COMPANY_ID = process.env.DEMO_COMPANY_ID ?? '30af2d51-1b4e-50f1-8531-12387f5b8e32';
const DEMO_ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'demo@alphataco.com';
/** Nombres validos de la empresa: el de la demo, o el que le deja seed-company antes del primer reset. */
const DEMO_COMPANY_NAMES = [COMPANY_PROFILE.name, 'Empresa Demo'];

class DryRunRollback extends Error {}

async function main(): Promise<void> {
  if (process.env.DEMO_RESET_ENABLED !== 'true') {
    console.log('DEMO_RESET_ENABLED no es "true": no se hace nada.');
    return;
  }
  const dry = process.argv.includes('--dry');
  const started = Date.now();
  const elapsed = () => ((Date.now() - started) / 1000).toFixed(1);
  const log = (message: string) => console.log(`[demo ${elapsed()}s] ${message}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const s3 = createS3();
    const cal = buildCalendar(argentinaToday());
    log(`hoy (AR) = ${cal.today}${dry ? ' — DRY RUN' : ''}`);

    const admin = await prisma.profile.findUnique({ where: { email: DEMO_ADMIN_EMAIL }, select: { id: true } });
    if (!admin) throw new Error(`No existe el usuario admin de la demo (${DEMO_ADMIN_EMAIL})`);

    let files: Ctx['files'] = [];
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('demo-reset'))`;
          await tx.$executeRaw`SELECT set_config('app.user_id', ${admin.id}, true)`;
          await assertDemoDatabase(tx, DEMO_COMPANY_ID, DEMO_COMPANY_NAMES);
          await wipeBusinessData(tx, log);

          const ctx: Ctx = {
            tx,
            cal,
            faker: createFaker(),
            company: { id: DEMO_COMPANY_ID, name: COMPANY_PROFILE.name, cuit: COMPANY_PROFILE.cuit },
            actorId: admin.id,
            files: [],
            log,
          };

          await seedCatalogs(ctx);
          await seedPriceRules(ctx);
          await seedCustomers(ctx);
          await linkPriceRules(ctx);
          await seedFiscalProfile(ctx);
          log('clientes, contratos y datos fiscales listos');
          const employees = await seedEmployees(ctx);
          const { vehicles, others } = await seedVehicles(ctx);
          await seedDocuments(ctx, employees, vehicles);
          const grid = buildDiagramGrid(ctx, employees);
          await seedDiagrams(ctx, grid);
          // Mantenimiento antes que operaciones: define que equipos estan hoy en taller, y un
          // equipo en taller no puede figurar trabajando en el parte.
          await seedMaintenance(ctx, employees, vehicles, others, grid);
          const rows = await seedOperations(ctx, employees, vehicles, others, grid);
          await seedCertifications(ctx, rows);
          // Almacenes antes que Gomeria: las cubiertas son unidades de stock del deposito base.
          await seedWarehouses(ctx, employees, vehicles, others);
          await seedTires(ctx, vehicles);
          await seedCandidates(ctx, employees);
          await seedClothing(ctx, employees);
          await seedKpis(ctx);
          await seedUsers(ctx, employees);
          await seedIndicators(ctx);

          files = ctx.files;
          if (dry) throw new DryRunRollback();

          // invoice-pdfs: los PDF fiscales que se generan al facturar en vivo durante la demo.
          await ensureBuckets(s3, [DOCUMENT_BUCKET, REMIT_BUCKET, 'invoice-pdfs']);
          await uploadAll(s3, files);
          log(`${files.length} archivos subidos`);
        },
        { timeout: 600_000, maxWait: 20_000 }
      );
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
      log(`dry run OK: ROLLBACK (${files.length} archivos no subidos)`);
      return;
    }

    const removed = await pruneObjects(s3, files, [
      { bucket: DOCUMENT_BUCKET, prefix: `${companyFolder()}/` },
      { bucket: REMIT_BUCKET, prefix: `${REMIT_PREFIX}/` },
    ]).catch((error) => {
      log(`no se pudieron limpiar archivos viejos: ${String(error)}`);
      return 0;
    });
    log(`COMMIT. ${removed} archivos viejos eliminados. Total ${elapsed()}s`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[demo] ERROR:', error);
  process.exit(1);
});
