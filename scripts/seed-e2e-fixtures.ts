/**
 * Datos mínimos para que el e2e compruebe que los listados clave MUESTRAN filas (no solo que cargan), sobre la empresa
 * y el equipo que dejan `seed-company.ts` (P4) y `seed-auth-fixtures.ts`. Idempotente: ids fijos.
 *
 * Crea:
 *  - Mantenimiento → Taller: una orden `in_workshop` del equipo P4QR01.
 *  - Mantenimiento → Aprobaciones: una orden `pending_workshop_validation` del mismo equipo.
 *  - Compras → Pagos → Vencimientos: un proveedor y una factura aprobada, vencida y sin pagar.
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

const prisma = new PrismaClient({
  adapter: new PrismaPg(prismaPgConfig(process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL)),
});
const COMPANY = '00000000-0000-0000-0000-0000000000f4';
const WORKSHOP_ORDER = '00000000-0000-4000-8000-0000000e2e01';
const VALIDATION_ORDER = '00000000-0000-4000-8000-0000000e2e02';
const SUPPLIER = '00000000-0000-4000-8000-0000000e2e03';
const INVOICE = '00000000-0000-4000-8000-0000000e2e04';

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

console.log('Fixtures del e2e OK');
await prisma.$disconnect();
