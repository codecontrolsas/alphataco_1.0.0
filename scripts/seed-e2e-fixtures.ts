/**
 * Datos mínimos para que el e2e compruebe que los listados clave MUESTRAN filas (no solo que cargan), sobre la empresa
 * y el equipo que dejan `seed-company.ts` (P4) y `seed-auth-fixtures.ts`. Idempotente: ids fijos.
 *
 * Crea:
 *  - Mantenimiento → Taller: una orden `in_workshop` del equipo P4QR01.
 *  - Mantenimiento → Aprobaciones: una orden `pending_workshop_validation` del mismo equipo.
 *  - Compras → Pagos → Vencimientos: un proveedor y una factura aprobada, vencida y sin pagar.
 *  - HSE → Documentos y Capacitaciones: un documento y una capacitación PUBLICADOS para todo el personal (con sus
 *    aceptaciones y asignaciones conciliadas por las funciones de la base, como al publicar desde el dashboard).
 * Configuración → Usuarios no necesita nada: ya está el admin (owner y miembro).
 *
 * Con la app bajo RLS (`e2e-rls`), una lista que consulta sin la empresa en el contexto devuelve cero filas: es lo que
 * pasó en la demo (ticket 800, Usuarios vacía) y lo que el e2e tiene que ver. Los valores que no hacen al caso son
 * relleno.
 *
 * Uso: DATABASE_URL=postgresql://... node scripts/seed-e2e-fixtures.ts (después de seed-auth-fixtures.ts)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { prismaPgConfig } from '../src/shared/lib/prisma-pg-config.ts';
import { enableAllModules, syncModuleCatalog } from './lib/module-control.ts';

const prisma = new PrismaClient({
  adapter: new PrismaPg(prismaPgConfig(process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL)),
});
const COMPANY = '00000000-0000-0000-0000-0000000000f4';
const WORKSHOP_ORDER = '00000000-0000-4000-8000-0000000e2e01';
const VALIDATION_ORDER = '00000000-0000-4000-8000-0000000e2e02';
const SUPPLIER = '00000000-0000-4000-8000-0000000e2e03';
const INVOICE = '00000000-0000-4000-8000-0000000e2e04';
const HSE_DOCUMENT = '00000000-0000-4000-8000-0000000e2e05';
const HSE_VERSION = '00000000-0000-4000-8000-0000000e2e06';
const HSE_TRAINING = '00000000-0000-4000-8000-0000000e2e07';
const HSE_QUESTION = '00000000-0000-4000-8000-0000000e2e08';
const HSE_OPTIONS = ['00000000-0000-4000-8000-0000000e2e09', '00000000-0000-4000-8000-0000000e2e0a'];

const vehicle = await prisma.vehicles.findFirstOrThrow({
  where: { company_id: COMPANY, domain: 'P4QR01' },
  select: { id: true },
});
const admin = await prisma.profile.findUniqueOrThrow({ where: { email: 'admin@p4.test' }, select: { id: true } });

await prisma.maintenance_orders.createMany({
  data: [
    {
      id: WORKSHOP_ORDER,
      company_id: COMPANY,
      equipment_id: vehicle.id,
      status: 'in_workshop',
      order_number: 'E2E-TALLER-1',
      description: 'Orden en taller del e2e',
      workshop_entry_date: new Date(),
    },
    {
      id: VALIDATION_ORDER,
      company_id: COMPANY,
      equipment_id: vehicle.id,
      status: 'pending_workshop_validation',
      order_number: 'E2E-VALIDAR-1',
      description: 'Orden a validar del e2e',
      workshop_entry_date: new Date(),
    },
  ],
  skipDuplicates: true,
});

await prisma.suppliers.createMany({
  data: [
    { id: SUPPLIER, company_id: COMPANY, name: 'Proveedor E2E', cuit: BigInt('30712345678'), vat_condition_id: 1 },
  ],
  skipDuplicates: true,
});

const today = new Date();
const issue = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 40));
const due = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 10));
await prisma.supplier_invoices.createMany({
  data: [
    {
      id: INVOICE,
      company_id: COMPANY,
      supplier_id: SUPPLIER,
      cbte_type: 1,
      sales_point: 1,
      number: BigInt(4242),
      issue_date: issue,
      due_date: due,
      vat_period: issue.toISOString().slice(0, 7),
      net_taxed: '1000.00',
      net_untaxed: '0.00',
      exempt: '0.00',
      vat_total: '210.00',
      vat_perceptions: '0.00',
      gross_income_perceptions: '0.00',
      other_taxes: '0.00',
      total: '1210.00',
      status: 'APPROVED',
      created_by: admin.id,
    },
  ],
  skipDuplicates: true,
});

// HSE: el contenido se carga en borrador (los triggers guarda no dejan tocarlo publicado) y después se publica. Si ya
// existe (segunda corrida), no se toca.
if (!(await prisma.hse_documents.findUnique({ where: { id: HSE_DOCUMENT }, select: { id: true } }))) {
  await prisma.hse_documents.create({
    data: { id: HSE_DOCUMENT, company_id: COMPANY, title: 'Documento HSE E2E', created_by: admin.id },
  });
  await prisma.hse_document_versions.create({
    data: {
      id: HSE_VERSION,
      company_id: COMPANY,
      document_id: HSE_DOCUMENT,
      version: 1,
      file_path: `${COMPANY}/documents/${HSE_DOCUMENT}/${HSE_VERSION}.pdf`,
      file_name: 'documento-e2e.pdf',
      file_size: 1,
      file_sha256: '0'.repeat(64),
      published_at: today,
      published_by: admin.id,
      created_by: admin.id,
    },
  });
  await prisma.hse_document_targets.create({ data: { company_id: COMPANY, document_id: HSE_DOCUMENT, kind: 'all' } });
  await prisma.hse_documents.update({
    where: { id: HSE_DOCUMENT },
    data: { status: 'published', current_version_id: HSE_VERSION },
  });
  await prisma.$executeRaw`SELECT public.hse_sync_acknowledgements(${COMPANY}::uuid, ${HSE_DOCUMENT}::uuid, NULL::uuid)`;
}
if (!(await prisma.hse_trainings.findUnique({ where: { id: HSE_TRAINING }, select: { id: true } }))) {
  await prisma.hse_trainings.create({
    data: { id: HSE_TRAINING, company_id: COMPANY, title: 'Capacitación E2E', created_by: admin.id },
  });
  await prisma.hse_training_targets.create({ data: { company_id: COMPANY, training_id: HSE_TRAINING, kind: 'all' } });
  await prisma.hse_training_questions.create({
    data: { id: HSE_QUESTION, company_id: COMPANY, training_id: HSE_TRAINING, prompt: 'Pregunta del e2e', points: 1 },
  });
  await prisma.hse_training_options.createMany({
    data: HSE_OPTIONS.map((id, position) => ({
      id,
      company_id: COMPANY,
      training_id: HSE_TRAINING,
      question_id: HSE_QUESTION,
      label: position === 0 ? 'Correcta' : 'Incorrecta',
      position,
    })),
  });
  await prisma.hse_training_answer_keys.create({
    data: { question_id: HSE_QUESTION, company_id: COMPANY, training_id: HSE_TRAINING, option_id: HSE_OPTIONS[0]! },
  });
  await prisma.hse_trainings.update({
    where: { id: HSE_TRAINING },
    data: { status: 'published', published_at: today, published_by: admin.id },
  });
  await prisma.$executeRaw`SELECT public.hse_sync_training_assignments(${COMPANY}::uuid, ${HSE_TRAINING}::uuid, NULL::uuid)`;
}

// F3: una base nueva nace con todos los módulos apagados; el e2e recorre todos, así que se encienden (y la pertenencia de
// pestañas se resincroniza por si el seed de otra empresa corrió después del arranque).
await syncModuleCatalog(prisma);
await enableAllModules(prisma, {
  actor: 'script:seed-e2e-fixtures',
  reason: 'Todos los módulos encendidos para el e2e',
});

console.log('Fixtures del e2e OK');
await prisma.$disconnect();
