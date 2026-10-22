import type { MailMessage } from '@/shared/lib/mail/transport';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integración real de los tres jobs de P5 contra el Postgres del compose.
 *
 * Corre sólo con `DATABASE_URL` definida:
 *
 *   docker compose --env-file .env.docker up -d --wait postgres
 *   set -a; source .env.docker; set +a
 *   DATABASE_URL=postgresql://alphataco:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/alphataco \
 *   JOBS_TOKEN=devtoken \
 *   npx vitest run src/features/Jobs/jobs/jobs.integration.test.ts
 *
 * O directamente `npm run test:jobs`.
 *
 * Lo único que se sustituye es el emisor de correo (`sendMail` inyectado), para capturar lo
 * que saldría sin depender de un SMTP. Todo lo demás corre de verdad: las funciones SQL, el
 * candado de `jobs_runs`, la resolución de destinatarios y los route handlers con su token.
 *
 * El test monta DOS empresas con datos propios, que es lo que hace verificable la propiedad
 * que más importa: que ningún correo mezcle empresas. Un test con una sola empresa no
 * distingue un job correcto de uno que manda todo a todos.
 */
const RUN = Boolean(process.env.DATABASE_URL);

const TOKEN = 'token-de-integracion-de-jobs';

const COMPANY_A = '11111111-1111-4111-8111-11111111aaaa';
const COMPANY_B = '11111111-1111-4111-8111-11111111bbbb';
const NAME_A = '__jobs_integracion_A__';
const NAME_B = '__jobs_integracion_B__';
const CUSTOMER_A = '22222222-2222-4222-8222-22222222aaaa';
const CUSTOMER_B = '22222222-2222-4222-8222-22222222bbbb';
const CUSTOMER_NAME_A = 'ClienteExclusivoDeA';
const CUSTOMER_NAME_B = 'ClienteExclusivoDeB';
const EMPLOYEE_A = '33333333-3333-4333-8333-33333333aaaa';
const EMPLOYEE_B = '33333333-3333-4333-8333-33333333bbbb';
const EMPLOYEE_LASTNAME_A = 'ApellidoExclusivoDeA';
const EMPLOYEE_LASTNAME_B = 'ApellidoExclusivoDeB';
const DOC_TYPE_A = '44444444-4444-4444-8444-44444444aaaa';
const DOC_TYPE_B = '44444444-4444-4444-8444-44444444bbbb';
const DOC_TYPE_NAME_A = 'TipoDocExclusivoDeA';
const DOC_TYPE_NAME_B = 'TipoDocExclusivoDeB';
const REPORT_A = '55555555-5555-4555-8555-55555555aaaa';
const REPORT_B = '55555555-5555-4555-8555-55555555bbbb';
const RECIPIENT_A = 'destinatario-de-a@integracion.local';
const RECIPIENT_B = 'destinatario-de-b@integracion.local';
const COUNTRY_ID = '66666666-6666-4666-8666-666666666666';

/** Fecha de negocio fija para todo el test, para no depender del día real. */
const TEST_DATE = '2026-06-15';
const TEST_DATE_UTC = new Date(`${TEST_DATE}T00:00:00Z`);

type Prisma = (typeof import('@/shared/lib/prisma'))['prisma'];
let prisma: Prisma;

/**
 * Busca un marcador en el HTML SIN distinguir mayúsculas.
 *
 * Hace falta porque un trigger de la base normaliza la capitalización de `employees.lastname`
 * (`ApellidoExclusivoDeA` se guarda como `Apellidoexclusivodea`). Comparar literal hacía que
 * el `toContain` fallara y —peor— que los `not.toContain` del marcador de la OTRA empresa
 * pasaran por la razón equivocada, sin probar nada.
 */
function mentions(html: string | undefined, marker: string): boolean {
  return (html ?? '').toLowerCase().includes(marker.toLowerCase());
}

/**
 * Envejece una corrida moviendo `started_at` hacia atrás CON SQL.
 *
 * Con SQL, para usar el mismo reloj que `claimRun` (`NOW()` de Postgres) y no el del proceso.
 */
async function moveStartedAt(id: string, interval: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE jobs_runs SET started_at = NOW() - $1::interval WHERE id = $2::uuid`,
    interval,
    id
  );
}

/** Emisor de prueba: captura los mensajes en vez de mandarlos. */
function makeMailCapture() {
  const sent: MailMessage[] = [];
  return {
    sent,
    sendMail: async (message: MailMessage) => {
      sent.push(message);
      return true;
    },
  };
}

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  // Sólo las filas de las empresas del test y las claves globales que el test fabrica. Un
  // `run_key contains '<fecha>'` alcanzaría filas de empresas reales con esa misma fecha.
  await prisma.jobs_runs.deleteMany({
    where: {
      OR: [
        { company_id: { in: companies } },
        {
          run_key: {
            in: [
              `${COMPANY_A}:${TEST_DATE}`,
              `${COMPANY_B}:${TEST_DATE}`,
              `fallo-simulado:${TEST_DATE}`,
              // Claves globales que fabrican los propios jobs con la fecha del test.
              `corrida:${TEST_DATE}`,
              `mantenimiento:${TEST_DATE}`,
            ],
          },
        },
      ],
    },
  });
  await prisma.dailyreportemployeerelations.deleteMany({
    where: { dailyreportrows: { daily_report_id: { in: [REPORT_A, REPORT_B] } } },
  });
  await prisma.dailyreportrows.deleteMany({ where: { daily_report_id: { in: [REPORT_A, REPORT_B] } } });
  await prisma.dailyreport.deleteMany({ where: { id: { in: [REPORT_A, REPORT_B] } } });
  await prisma.documents_employees.deleteMany({ where: { applies: { in: [EMPLOYEE_A, EMPLOYEE_B] } } });
  await prisma.documents_employees.deleteMany({ where: { id_document_types: { in: [DOC_TYPE_A, DOC_TYPE_B] } } });
  await prisma.employees.deleteMany({ where: { id: { in: [EMPLOYEE_A, EMPLOYEE_B] } } });
  await prisma.document_types.deleteMany({ where: { id: { in: [DOC_TYPE_A, DOC_TYPE_B] } } });
  await prisma.customers.deleteMany({ where: { id: { in: [CUSTOMER_A, CUSTOMER_B] } } });
  await prisma.daily_indicators.deleteMany({ where: { company_id: { in: companies } } });
  await prisma.notification_settings.deleteMany({ where: { company_id: { in: companies } } });
  await prisma.company.deleteMany({ where: { id: { in: companies } } });
}

async function seedCompany(params: {
  companyId: string;
  companyName: string;
  cuit: string;
  customerId: string;
  customerName: string;
  customerCuit: bigint;
  employeeId: string;
  employeeLastname: string;
  cuil: string;
  documentNumber: string;
  file: string;
  docTypeId: string;
  docTypeName: string;
  reportId: string;
  recipient: string;
  cityId: bigint;
  provinceId: bigint;
  countryId: string;
}): Promise<void> {
  await prisma.company.create({
    data: {
      id: params.companyId,
      company_name: params.companyName,
      description: 'Empresa de test de integración de jobs',
      contact_email: `contacto-${params.companyName}@integracion.local`,
      contact_phone: '0000000000',
      address: 'Sin especificar',
      city: params.cityId,
      country: 'Argentina',
      industry: 'Sin especificar',
      company_cuit: params.cuit,
    },
  });

  // Destinatarios PROPIOS de esta empresa. Es lo que el test usa para comprobar que el
  // correo de A no llega a la casilla de B.
  for (const kind of ['documents_expiry', 'daily_report_deviations'] as const) {
    await prisma.notification_settings.create({
      data: { company_id: params.companyId, kind, recipients: [params.recipient] },
    });
  }

  await prisma.customers.create({
    data: {
      id: params.customerId,
      name: params.customerName,
      cuit: params.customerCuit,
      company_id: params.companyId,
    },
  });

  await prisma.employees.create({
    data: {
      id: params.employeeId,
      company_id: params.companyId,
      lastname: params.employeeLastname,
      firstname: 'Nombre',
      cuil: params.cuil,
      document_number: params.documentNumber,
      birthplace: params.countryId,
      street: 'Calle',
      street_number: '1',
      province: params.provinceId,
      phone: '0000000000',
      file: params.file,
      date_of_admission: new Date('2020-01-01T00:00:00Z'),
    },
  });

  // Documento que vence dentro de la ventana de 7 días del job semanal.
  await prisma.document_types.create({
    data: {
      id: params.docTypeId,
      name: params.docTypeName,
      applies: 'Persona',
      multiresource: false,
      mandatory: true,
      explired: true,
      special: false,
      company_id: params.companyId,
    },
  });
  await prisma.documents_employees.deleteMany({
    where: { applies: params.employeeId, id_document_types: params.docTypeId },
  });
  await prisma.documents_employees.create({
    data: {
      applies: params.employeeId,
      id_document_types: params.docTypeId,
      // `get_documents_expiry_summary` compara contra la fecha REAL de hoy (NOW() en Buenos
      // Aires), no contra la fecha de negocio del job: la ventana se calcula dentro del SQL.
      validity: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      state: 'presentado',
      document_path: 'fake/path.pdf',
    },
  });

  // Parte diario del día con una fila y un empleado sin diagrama → desvío garantizado.
  await prisma.dailyreport.create({
    data: { id: params.reportId, company_id: params.companyId, date: TEST_DATE_UTC, is_active: true },
  });
  const row = await prisma.dailyreportrows.create({
    data: { daily_report_id: params.reportId, customer_id: params.customerId, status: 'pendiente' },
  });
  await prisma.dailyreportemployeerelations.create({
    data: { daily_report_row_id: row.id, employee_id: params.employeeId },
  });
}

describe.skipIf(!RUN)('jobs de P5 (integración contra el compose)', () => {
  beforeAll(async () => {
    process.env.JOBS_TOKEN = TOKEN;
    ({ prisma } = await import('@/shared/lib/prisma'));

    await cleanup();

    // Catálogo mínimo: `employees` exige `birthplace` (FK a countries) y `province`. Se crea
    // acá y no se asume el seed, para que la suite corra contra una base recién migrada (CI).
    const country =
      (await prisma.countries.findFirst({ select: { id: true } })) ??
      (await prisma.countries.create({ data: { id: COUNTRY_ID, name: 'Sin especificar' }, select: { id: true } }));
    const province = await prisma.provinces.upsert({
      where: { id: BigInt(1) },
      update: {},
      create: { id: BigInt(1), name: 'Sin especificar' },
      select: { id: true },
    });
    const city = await prisma.cities.upsert({
      where: { id: BigInt(1) },
      update: {},
      create: { id: BigInt(1), name: 'Sin especificar', province_id: province.id },
      select: { id: true },
    });

    await seedCompany({
      companyId: COMPANY_A,
      companyName: NAME_A,
      cuit: 'JOBS-TEST-A',
      customerId: CUSTOMER_A,
      customerName: CUSTOMER_NAME_A,
      customerCuit: BigInt(30111111111),
      employeeId: EMPLOYEE_A,
      employeeLastname: EMPLOYEE_LASTNAME_A,
      cuil: '20-11111111-1',
      documentNumber: 'JOBSTEST-A',
      file: 'A-001',
      docTypeId: DOC_TYPE_A,
      docTypeName: DOC_TYPE_NAME_A,
      reportId: REPORT_A,
      recipient: RECIPIENT_A,
      cityId: city.id,
      provinceId: province.id,
      countryId: country.id,
    });

    await seedCompany({
      companyId: COMPANY_B,
      companyName: NAME_B,
      cuit: 'JOBS-TEST-B',
      customerId: CUSTOMER_B,
      customerName: CUSTOMER_NAME_B,
      customerCuit: BigInt(30222222222),
      employeeId: EMPLOYEE_B,
      employeeLastname: EMPLOYEE_LASTNAME_B,
      cuil: '20-22222222-2',
      documentNumber: 'JOBSTEST-B',
      file: 'B-001',
      docTypeId: DOC_TYPE_B,
      docTypeName: DOC_TYPE_NAME_B,
      reportId: REPORT_B,
      recipient: RECIPIENT_B,
      cityId: city.id,
      provinceId: province.id,
      countryId: country.id,
    });
  }, 120_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  // ────────────────────────────────────────────────────────────────────────────
  // Autenticación — por los route handlers de verdad
  // ────────────────────────────────────────────────────────────────────────────
  describe('autenticación de los endpoints', () => {
    const routes = [
      ['documents-expiry', () => import('@/app/api/jobs/documents-expiry/route')],
      ['daily-report-deviations', () => import('@/app/api/jobs/daily-report-deviations/route')],
      ['daily-indicators', () => import('@/app/api/jobs/daily-indicators/route')],
    ] as const;

    it.each(routes)('%s responde 401 sin header Authorization', async (name, load) => {
      const { GET } = await load();
      const response = await GET(new Request(`http://localhost:3000/api/jobs/${name}`));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it.each(routes)('%s responde 401 con un token incorrecto', async (name, load) => {
      const { GET } = await load();
      const response = await GET(
        new Request(`http://localhost:3000/api/jobs/${name}`, {
          headers: { authorization: `Bearer ${TOKEN}-mal` },
        })
      );
      expect(response.status).toBe(401);
    });

    it('el 401 no filtra nada del estado del sistema', async () => {
      const { GET } = await import('@/app/api/jobs/daily-indicators/route');
      const response = await GET(
        new Request('http://localhost:3000/api/jobs/daily-indicators', {
          headers: { authorization: 'Bearer cualquier-cosa' },
        })
      );
      const body = await response.text();
      expect(body).toBe(JSON.stringify({ error: 'Unauthorized' }));
      expect(body).not.toContain(TOKEN);
      expect(body).not.toContain('company');
    });

    it('con el token correcto el endpoint corre y devuelve 200', async () => {
      const { GET } = await import('@/app/api/jobs/daily-indicators/route');
      const response = await GET(
        new Request('http://localhost:3000/api/jobs/daily-indicators', {
          headers: { authorization: `Bearer ${TOKEN}` },
        })
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.job).toBe('daily-indicators');
      expect(body.failed).toBe(0);
    }, 120_000);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // daily-indicators
  // ────────────────────────────────────────────────────────────────────────────
  describe('daily-indicators', () => {
    it('escribe daily_indicators por empresa y es idempotente al correrlo dos veces', async () => {
      const { runDailyIndicatorsJob } = await import('./daily-indicators');

      const first = await runDailyIndicatorsJob({ date: TEST_DATE });
      expect(first.failed).toBe(0);

      const unitA = first.units.find((unit) => unit.companyId === COMPANY_A);
      const unitB = first.units.find((unit) => unit.companyId === COMPANY_B);
      expect(unitA?.status).toBe('ok');
      expect(unitB?.status).toBe('ok');

      // Cada snapshot lleva su empresa: no hay filas de A bajo B ni viceversa.
      const today = await prisma.daily_indicators.findMany({
        where: { company_id: { in: [COMPANY_A, COMPANY_B] } },
        select: { company_id: true, source: true, snapshot_date: true },
      });
      expect(today.length).toBeGreaterThan(0);
      const perCompany = new Map<string, number>();
      for (const row of today) perCompany.set(row.company_id, (perCompany.get(row.company_id) ?? 0) + 1);
      expect(perCompany.get(COMPANY_A)).toBeGreaterThan(0);
      expect(perCompany.get(COMPANY_B)).toBeGreaterThan(0);

      const rowsAfterFirst = today.length;

      // Segunda corrida el MISMO día: el candado de jobs_runs la saltea entera.
      const second = await runDailyIndicatorsJob({ date: TEST_DATE });
      expect(second.failed).toBe(0);
      expect(second.units.find((unit) => unit.companyId === COMPANY_A)?.status).toBe('skipped');
      expect(second.units.find((unit) => unit.companyId === COMPANY_B)?.status).toBe('skipped');

      const rowsAfterSecond = await prisma.daily_indicators.count({
        where: { company_id: { in: [COMPANY_A, COMPANY_B] } },
      });
      expect(rowsAfterSecond).toBe(rowsAfterFirst);
    }, 180_000);

    it('las funciones SQL soportan una segunda escritura del mismo día sin duplicar ni romper', async () => {
      // Segunda red, independiente de `jobs_runs`: si alguien borra la bitácora o reintenta
      // una corrida en `error`, el SQL tiene que aguantar el reingreso. Es exactamente lo
      // que NO pasaba antes de `20260923180000_daily_indicators_idempotent`.
      const { callVoid } = await import('@/shared/lib/sql');

      const before = await prisma.daily_indicators.count({ where: { company_id: COMPANY_A } });
      await expect(callVoid('run_daily_indicators_for_company', [{ uuid: COMPANY_A }])).resolves.toBeUndefined();
      const after = await prisma.daily_indicators.count({ where: { company_id: COMPANY_A } });

      expect(after).toBe(before);
    }, 120_000);

    it('deja la corrida registrada en jobs_runs con su metadata', async () => {
      const run = await prisma.jobs_runs.findUnique({
        where: { job_run_key: { job: 'daily-indicators', run_key: `${COMPANY_A}:${TEST_DATE}` } },
      });
      expect(run).not.toBeNull();
      expect(run?.status).toBe('ok');
      expect(run?.company_id).toBe(COMPANY_A);
      expect(run?.finished_at).not.toBeNull();
      expect(run?.error).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // daily-report-deviations
  // ────────────────────────────────────────────────────────────────────────────
  describe('daily-report-deviations', () => {
    it('manda un correo por empresa, cada uno sólo con sus propios datos', async () => {
      const { runDailyReportDeviationsJob } = await import('./daily-report-deviations');
      const capture = makeMailCapture();

      const summary = await runDailyReportDeviationsJob({ date: TEST_DATE, sendMail: capture.sendMail });
      expect(summary.failed).toBe(0);

      const mailA = capture.sent.find((message) => message.subject.includes(NAME_A));
      const mailB = capture.sent.find((message) => message.subject.includes(NAME_B));
      expect(mailA).toBeDefined();
      expect(mailB).toBeDefined();

      // 1. Cada correo va SÓLO a los destinatarios de su empresa.
      expect(mailA?.to).toEqual([RECIPIENT_A]);
      expect(mailB?.to).toEqual([RECIPIENT_B]);

      // 2. El contenido de A no menciona nada de B, y viceversa. Es la prueba de que no se
      //    mezclan empresas: los nombres de cliente y de empleado son exclusivos de cada una.
      expect(mentions(mailA?.html, CUSTOMER_NAME_A)).toBe(true);
      expect(mentions(mailA?.html, CUSTOMER_NAME_B)).toBe(false);
      expect(mentions(mailA?.html, EMPLOYEE_LASTNAME_B)).toBe(false);
      expect(mentions(mailA?.html, NAME_B)).toBe(false);

      expect(mentions(mailB?.html, CUSTOMER_NAME_B)).toBe(true);
      expect(mentions(mailB?.html, CUSTOMER_NAME_A)).toBe(false);
      expect(mentions(mailB?.html, EMPLOYEE_LASTNAME_A)).toBe(false);
      expect(mentions(mailB?.html, NAME_A)).toBe(false);

      // 3. El correo trae el desvío esperado del empleado sin diagrama.
      expect(mentions(mailA?.html, EMPLOYEE_LASTNAME_A)).toBe(true);
      expect(mailA?.html).toContain('Sin diagrama');
      expect(mailA?.text).toContain(NAME_A);
    }, 120_000);

    it('correrlo dos veces el mismo día NO manda el correo de nuevo', async () => {
      const { runDailyReportDeviationsJob } = await import('./daily-report-deviations');
      const capture = makeMailCapture();

      const summary = await runDailyReportDeviationsJob({ date: TEST_DATE, sendMail: capture.sendMail });

      expect(capture.sent).toHaveLength(0);
      expect(summary.emailsSent).toBe(0);
      expect(summary.units.find((unit) => unit.companyId === COMPANY_A)?.status).toBe('skipped');
      expect(summary.units.find((unit) => unit.companyId === COMPANY_A)?.reason).toBe('ya procesada hoy');
    }, 120_000);

    it('una corrida que quedó en error SÍ se reintenta, sin reenviar las que salieron bien', async () => {
      // Se fuerza a la empresa B a estado `error`: el reintento tiene que volver a tomar B y
      // seguir salteando A. Con una clave de idempotencia por corrida (y no por empresa),
      // este reintento reenviaría también el correo de A.
      await prisma.jobs_runs.update({
        where: { job_run_key: { job: 'daily-report-deviations', run_key: `${COMPANY_B}:${TEST_DATE}` } },
        data: { status: 'error', error: 'fallo simulado' },
      });
      // Desde #786 el aviso queda registrado (`notification_events`) y no se reenvía si ya salió. Una
      // corrida termina en error cuando el envío falló: se simula marcando el mail de B como fallido.
      await prisma.notification_events.updateMany({
        where: { company_id: COMPANY_B, event_key: 'operations.daily_report_deviations' },
        data: { email_status: 'failed' },
      });

      const { runDailyReportDeviationsJob } = await import('./daily-report-deviations');
      const capture = makeMailCapture();

      const summary = await runDailyReportDeviationsJob({ date: TEST_DATE, sendMail: capture.sendMail });

      expect(capture.sent).toHaveLength(1);
      expect(capture.sent[0]?.to).toEqual([RECIPIENT_B]);
      expect(summary.units.find((unit) => unit.companyId === COMPANY_A)?.status).toBe('skipped');
      expect(summary.units.find((unit) => unit.companyId === COMPANY_B)?.status).toBe('ok');
    }, 120_000);

    it('una empresa sin destinatarios queda registrada, no se manda nada "por las dudas"', async () => {
      await prisma.notification_settings.update({
        where: { company_id_kind: { company_id: COMPANY_A, kind: 'daily_report_deviations' } },
        data: { recipients: [] },
      });
      await prisma.jobs_runs.deleteMany({
        where: { job: 'daily-report-deviations', run_key: `${COMPANY_A}:${TEST_DATE}` },
      });

      const { runDailyReportDeviationsJob } = await import('./daily-report-deviations');
      const capture = makeMailCapture();
      const summary = await runDailyReportDeviationsJob({ date: TEST_DATE, sendMail: capture.sendMail });

      const unitA = summary.units.find((unit) => unit.companyId === COMPANY_A);
      // `skipped`, no `ok`: la clave queda reclamable para que un redisparo del mismo día
      // la reintente si alguien carga los destinatarios a media mañana.
      expect(unitA?.status).toBe('skipped');
      expect(unitA?.emailSent).toBe(false);
      expect(unitA?.reason).toContain('destinatarios');
      expect(capture.sent.some((message) => message.subject.includes(NAME_A))).toBe(false);

      const storedA = await prisma.jobs_runs.findUnique({
        where: { job_run_key: { job: 'daily-report-deviations', run_key: `${COMPANY_A}:${TEST_DATE}` } },
      });
      expect(storedA?.status).toBe('skipped');

      await prisma.notification_settings.update({
        where: { company_id_kind: { company_id: COMPANY_A, kind: 'daily_report_deviations' } },
        data: { recipients: [RECIPIENT_A] },
      });
    }, 120_000);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // documents-expiry
  // ────────────────────────────────────────────────────────────────────────────
  describe('documents-expiry', () => {
    it('manda un resumen por empresa con los documentos de esa empresa solamente', async () => {
      const { runDocumentsExpiryJob } = await import('./documents-expiry');
      const capture = makeMailCapture();

      const summary = await runDocumentsExpiryJob({ date: TEST_DATE, sendMail: capture.sendMail });
      expect(summary.failed).toBe(0);

      const mailA = capture.sent.find((message) => message.subject.includes(NAME_A));
      const mailB = capture.sent.find((message) => message.subject.includes(NAME_B));
      expect(mailA).toBeDefined();
      expect(mailB).toBeDefined();

      expect(mailA?.to).toEqual([RECIPIENT_A]);
      expect(mailB?.to).toEqual([RECIPIENT_B]);

      // El documento por vencer de A aparece en el correo de A y NO en el de B.
      expect(mentions(mailA?.html, DOC_TYPE_NAME_A)).toBe(true);
      expect(mentions(mailA?.html, EMPLOYEE_LASTNAME_A)).toBe(true);
      expect(mentions(mailA?.html, DOC_TYPE_NAME_B)).toBe(false);
      expect(mentions(mailA?.html, EMPLOYEE_LASTNAME_B)).toBe(false);

      expect(mentions(mailB?.html, DOC_TYPE_NAME_B)).toBe(true);
      expect(mentions(mailB?.html, EMPLOYEE_LASTNAME_B)).toBe(true);
      expect(mentions(mailB?.html, DOC_TYPE_NAME_A)).toBe(false);
      expect(mentions(mailB?.html, EMPLOYEE_LASTNAME_A)).toBe(false);
    }, 120_000);

    it('correrlo dos veces el mismo día NO manda el correo de nuevo', async () => {
      const { runDocumentsExpiryJob } = await import('./documents-expiry');
      const capture = makeMailCapture();

      const summary = await runDocumentsExpiryJob({ date: TEST_DATE, sendMail: capture.sendMail });

      expect(capture.sent).toHaveLength(0);
      expect(summary.emailsSent).toBe(0);
      expect(summary.skipped).toBeGreaterThanOrEqual(2);
    }, 120_000);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Observabilidad
  // ────────────────────────────────────────────────────────────────────────────
  describe('observabilidad', () => {
    it('el ciclo error -> reintento -> ok -> bloqueado del candado de jobs_runs', async () => {
      // NOTA: el 500 ante fallo parcial se prueba en `src/features/Jobs/lib/handler.test.ts`,
      // que construye la Request y mira el status. Acá se prueba el candado contra la base.
      const { claimRun, finishRun, lastRun } = await import('../lib/runs');
      const KEY = `fallo-simulado:${TEST_DATE}`;

      const claim = await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null });
      expect(claim).not.toBeNull();
      await finishRun({ id: claim!.id, status: 'error', error: 'boom' });

      const stored = await lastRun('daily-indicators', KEY);
      expect(stored?.status).toBe('error');
      expect(stored?.error).toBe('boom');

      // Una corrida en `error` se puede volver a reclamar (es reintentable).
      const retry = await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null });
      expect(retry).not.toBeNull();
      expect(retry?.attempts).toBe(2);
      await finishRun({ id: retry!.id, status: 'ok' });

      // Una corrida en `ok` NO se puede reclamar de nuevo: es el candado de idempotencia.
      expect(await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null })).toBeNull();
    }, 60_000);

    it('una corrida `skipped` SÍ se vuelve a reclamar: el motivo puede corregirse el mismo día', async () => {
      const { claimRun, finishRun } = await import('../lib/runs');
      const KEY = `skipped-simulado:${TEST_DATE}`;
      await prisma.jobs_runs.deleteMany({ where: { job: 'daily-indicators', run_key: KEY } });

      const first = await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null });
      await finishRun({ id: first!.id, status: 'skipped' });

      const second = await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null });
      expect(second).not.toBeNull();
      expect(second?.attempts).toBe(2);

      await prisma.jobs_runs.deleteMany({ where: { job: 'daily-indicators', run_key: KEY } });
    }, 60_000);

    it('una corrida `running` RECIENTE no se puede reclamar: dos disparos simultáneos no duplican', async () => {
      const { claimRun } = await import('../lib/runs');
      const KEY = `running-reciente:${TEST_DATE}`;
      await prisma.jobs_runs.deleteMany({ where: { job: 'daily-indicators', run_key: KEY } });

      const first = await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null });
      expect(first).not.toBeNull();

      // Queda `running` desde hace 5 minutos: alguien la está haciendo ahora mismo.
      // El desfase se aplica con SQL (`NOW() - interval`), con el mismo reloj que `claimRun`.
      await moveStartedAt(first!.id, '5 minutes');

      expect(await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null })).toBeNull();

      await prisma.jobs_runs.deleteMany({ where: { job: 'daily-indicators', run_key: KEY } });
    }, 60_000);

    it('una corrida `running` COLGADA hace más de una hora sí se puede reclamar', async () => {
      // Sin esta rama, un proceso que muere a mitad de camino dejaría la clave trabada para
      // siempre y esa empresa no volvería a recibir el correo nunca.
      const { claimRun } = await import('../lib/runs');
      const KEY = `running-colgada:${TEST_DATE}`;
      await prisma.jobs_runs.deleteMany({ where: { job: 'daily-indicators', run_key: KEY } });

      const first = await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null });
      await moveStartedAt(first!.id, '2 hours');

      const reclaimed = await claimRun({ job: 'daily-indicators', runKey: KEY, companyId: null });
      expect(reclaimed).not.toBeNull();
      expect(reclaimed?.attempts).toBe(2);

      await prisma.jobs_runs.deleteMany({ where: { job: 'daily-indicators', run_key: KEY } });
    }, 60_000);

    it('la corrida entera deja fila de bitácora, incluso si el job aborta antes del bucle', async () => {
      // Es el agujero que tapa `runJobWithBitacora`: con la base caída, el `findMany` de
      // empresas lanzaba ANTES de que existiera ninguna fila, y el rastro era cero.
      const { runJobWithBitacora } = await import('../lib/per-company');
      const { lastRun } = await import('../lib/runs');
      const KEY = `corrida:${TEST_DATE}`;

      await expect(
        runJobWithBitacora('daily-indicators', TEST_DATE, async () => {
          throw new Error('la base no responde');
        })
      ).rejects.toThrow('la base no responde');

      const row = await lastRun('daily-indicators', KEY);
      expect(row?.status).toBe('error');
      expect(row?.error).toBe('la base no responde');
      expect(row?.finished_at).not.toBeNull();
    }, 60_000);

    it('la duración registrada es real: finished_at no queda corrido por la zona horaria', async () => {
      // Regresión: con la sesión en hora argentina, `finished_at: new Date()` se guardaba 3 horas
      // adelante y un job de 5 ms figuraba como `03:00:00.005`. Ver `prisma-pg-config.ts`.
      const [row] = await prisma.$queryRawUnsafe<Array<{ duracion_segundos: number }>>(
        `SELECT EXTRACT(EPOCH FROM (finished_at - started_at))::float8 AS duracion_segundos
           FROM jobs_runs
          WHERE job = 'documents-expiry' AND run_key = $1 AND finished_at IS NOT NULL`,
        `${COMPANY_B}:${TEST_DATE}`
      );

      expect(row).toBeDefined();
      expect(row.duracion_segundos).toBeGreaterThanOrEqual(0);
      expect(row.duracion_segundos).toBeLessThan(120);
    });

    it('cada corrida deja en jobs_runs cuántos destinatarios recibieron el correo', async () => {
      const run = await prisma.jobs_runs.findUnique({
        where: { job_run_key: { job: 'documents-expiry', run_key: `${COMPANY_B}:${TEST_DATE}` } },
      });
      expect(run?.status).toBe('ok');
      const metadata = run?.metadata as Record<string, unknown> | undefined;
      expect(metadata?.recipients).toBe(1);
      expect(metadata?.emailSent).toBe(true);
    });
  });
});
