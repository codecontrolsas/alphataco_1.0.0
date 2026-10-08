import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MailMessage } from '@/shared/lib/mail';

/**
 * Integracion del mail semanal de lotes por vencer (Almacenes etapa 2) contra el Postgres del
 * compose: `npm run test:jobs`.
 *
 * Dos empresas: una con lotes (vencido, por vencer, lejano y uno sin saldo) y otra sin lotes.
 * Verifica que cada empresa recibe SOLO lo suyo, que la que no tiene nada que avisar se saltea
 * sin correo, que no entran ni lotes fuera de la ventana ni lotes sin saldo, y la idempotencia.
 *
 * El job recorre TODAS las empresas de la base: por eso las aserciones miran solo las del
 * test, y la fecha de negocio es 2099 (ninguna corrida real cae ese dia, asi la limpieza de
 * `jobs_runs` por fecha no toca nada ajeno).
 */
const RUN = Boolean(process.env.DATABASE_URL);

const TEST_DATE = '2099-03-01';
const COMPANY_A = '77777777-7777-4777-8777-77777777aaaa';
const COMPANY_B = '77777777-7777-4777-8777-77777777bbbb';
const RECIPIENT_A = 'lotes-a@integracion.local';
const RECIPIENT_B = 'lotes-b@integracion.local';
const UNIT = '77777777-7777-4777-8777-777777770001';
const WAREHOUSE = '77777777-7777-4777-8777-777777770002';
const MATERIAL = '77777777-7777-4777-8777-777777770003';
const BATCHES = {
  expired: { id: '77777777-7777-4777-8777-777777770010', number: 'LOTE-VENCIDO', expires: '2099-02-20', qty: 5 },
  expiring: { id: '77777777-7777-4777-8777-777777770011', number: 'LOTE-POR-VENCER', expires: '2099-03-20', qty: 3 },
  far: { id: '77777777-7777-4777-8777-777777770012', number: 'LOTE-LEJANO', expires: '2099-06-01', qty: 7 },
  empty: { id: '77777777-7777-4777-8777-777777770013', number: 'LOTE-SIN-SALDO', expires: '2099-03-05', qty: 0 },
};

type Prisma = typeof import('@/shared/lib/prisma')['prisma'];
let prisma: Prisma;

async function cleanup() {
  await prisma.jobs_runs.deleteMany({
    where: { job: 'warehouse-batch-expiry', run_key: { endsWith: TEST_DATE } },
  });
  await prisma.stock_balances.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  await prisma.material_batches.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  await prisma.materials.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  await prisma.warehouses.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  await prisma.measurement_units.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  await prisma.notification_settings.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
}

describe.skipIf(!RUN)('job warehouse-batch-expiry (integracion)', () => {
  const sent: MailMessage[] = [];
  const fakeSend = async (message: MailMessage) => {
    sent.push(message);
    return true;
  };

  beforeAll(async () => {
    prisma = (await import('@/shared/lib/prisma')).prisma;
    await cleanup();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, name, cuit, recipient] of [
      [COMPANY_A, 'Lotes A', '30999999971', RECIPIENT_A],
      [COMPANY_B, 'Lotes B', '30999999972', RECIPIENT_B],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: name,
          description: 'empresa de prueba',
          contact_email: recipient,
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
      await prisma.notification_settings.create({
        data: { company_id: id, kind: 'stock_batch_expiry', recipients: [recipient], is_active: true },
      });
    }

    await prisma.measurement_units.create({ data: { id: UNIT, company_id: COMPANY_A, name: 'Litro', abbreviation: 'l' } });
    await prisma.warehouses.create({ data: { id: WAREHOUSE, company_id: COMPANY_A, code: 'B', name: 'Base A' } });
    await prisma.materials.create({
      data: { id: MATERIAL, company_id: COMPANY_A, code: 'DES', name: 'Desengrasante', unit_id: UNIT, tracking_type: 'BATCH' },
    });
    for (const b of Object.values(BATCHES)) {
      await prisma.material_batches.create({
        data: { id: b.id, company_id: COMPANY_A, material_id: MATERIAL, batch_number: b.number, expires_at: new Date(`${b.expires}T00:00:00Z`) },
      });
      await prisma.stock_balances.create({
        data: { company_id: COMPANY_A, material_id: MATERIAL, warehouse_id: WAREHOUSE, batch_id: b.id, quantity: b.qty },
      });
    }
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  it('manda un correo a la empresa con lotes, solo con lo suyo y dentro de la ventana', async () => {
    const { runWarehouseBatchExpiryJob } = await import('./warehouse-batch-expiry');
    const summary = await runWarehouseBatchExpiryJob({ date: TEST_DATE, sendMail: fakeSend });

    const unitA = summary.units.find((u) => u.companyId === COMPANY_A);
    const unitB = summary.units.find((u) => u.companyId === COMPANY_B);
    expect(unitA).toMatchObject({ status: 'ok', emailSent: true, recipients: 1, metadata: { expired: 1, expiring: 1 } });
    expect(unitB).toMatchObject({ status: 'skipped', reason: 'sin lotes vencidos ni por vencer' });

    const mailsA = sent.filter((m) => [m.to].flat().includes(RECIPIENT_A));
    const mailsB = sent.filter((m) => [m.to].flat().includes(RECIPIENT_B));
    expect(mailsA).toHaveLength(1);
    expect(mailsB).toHaveLength(0);

    const html = mailsA[0]!.html ?? '';
    expect(html).toContain('LOTE-VENCIDO');
    expect(html).toContain('LOTE-POR-VENCER');
    expect(html).not.toContain('LOTE-LEJANO');
    expect(html).not.toContain('LOTE-SIN-SALDO');
    expect(mailsA[0]!.text).toContain('Vencidos: 1');
  });

  it('correrlo dos veces el mismo dia no manda otro correo', async () => {
    const { runWarehouseBatchExpiryJob } = await import('./warehouse-batch-expiry');
    const before = sent.filter((m) => [m.to].flat().includes(RECIPIENT_A)).length;
    await runWarehouseBatchExpiryJob({ date: TEST_DATE, sendMail: fakeSend });
    expect(sent.filter((m) => [m.to].flat().includes(RECIPIENT_A)).length).toBe(before);
  });
});
