import {
  documentDetailResponseSchema,
  documentListResponseSchema,
  documentFiltersResponseSchema,
} from '@/features/MobileApi/contracts/documents';
import {
  equipmentDetailResponseSchema,
  equipmentFiltersResponseSchema,
  equipmentListResponseSchema,
} from '@/features/MobileApi/contracts/equipment';
import type { PrismaClient } from '@/generated/prisma/client';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { ensureCity } from '@/test/db-fixtures';
import {
  createTestEmployee,
  createTestUser,
  dropCatalogRows,
  dropTestUsers,
  emptyCatalogRows,
  grantPermissions,
} from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * API móvil de Equipos y Documentación (solo lectura) por las rutas reales, bajo el rol REAL de la app, con dos
 * empresas y módulos apagados. Solo se sustituyen la verificación del token de Better Auth (`Bearer <userId>`) y el
 * cliente S3 (no hay storage en la prueba: se registra qué key se pidió). Corre con `scripts/test-rls.sh`.
 */
const sessions = vi.hoisted(() => new Map<string, string>());
const s3Keys = vi.hoisted(() => [] as string[]);

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/shared/lib/auth', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const userId = headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
        const company = sessions.get(userId);
        return company
          ? { user: { id: userId, isAnonymous: false }, session: { company, token: `t-${userId}` } }
          : null;
      },
    },
  },
}));
vi.mock('@/shared/lib/s3', () => ({
  s3Client: () => ({
    send: async (command: { input: { Key: string } }) => {
      s3Keys.push(command.input.Key);
      return {
        Body: { transformToWebStream: () => new Blob(['%PDF-1.4 prueba']).stream() },
        ContentType: 'application/pdf',
        ContentLength: 15,
      };
    },
  }),
}));

const P = '7e400000-0000-4000-8000-';
const COMPANY_A = `${P}00000000000a`;
const COMPANY_B = `${P}00000000000b`;
const FULL = `${P}0000000001a1`;
const LIMITED = `${P}0000000001a2`;
const FULL_B = `${P}0000000001b1`;
const id = (n: number) => `${P}0000000002${String(n).padStart(2, '0')}`;

const TYPE_V = id(1);
const TYPE_O = id(2);
const V_AA111AA = id(10);
const V_NULL_1 = id(11);
const V_AA111AB = id(12);
const V_SPACES = id(13);
const V_NULL_2 = id(14);
const V_INACTIVE = id(15);
const V_B = id(16);
const O_INT1 = id(20);
const O_NULL = id(21);
const CERT = id(22);
const OWNER = id(23);
const CUSTOMER = id(24);
const E1 = id(30);
const E_B = id(31);
const DT_EMP = id(40);
const DT_EMP_PRIVATE = id(41);
const DT_EMP_ARCHIVED = id(42);
const DT_VEH = id(43);
const DT_COMPANY = id(44);
const DT_B = id(45);
const DOC_EMP = id(50);
const DOC_EMP_PRIVATE = id(51);
const DOC_EMP_ARCHIVED = id(52);
const DOC_VEH = id(53);
const DOC_B = id(54);

const ACTIVE_VEHICLES_A = [V_AA111AA, V_NULL_1, V_AA111AB, V_SPACES, V_NULL_2];

let owner: PrismaClient;
const catalog = emptyCatalogRows();

const FULL_KEYS = [
  'equipos:vehicles:view',
  'equipos:others:view',
  'equipos:inactive:view',
  'equipos:detalle-equipo:view',
  'equipos:datos-basicos:view',
  'equipos:asignacion:view',
  'equipos:detalle-otro-equipo:view',
  'equipos:datos-basicos-otro:view',
  'equipos:certificaciones-otro:view',
  'documentacion:documentos-de-empleados:view',
  'documentacion:documentos-de-empleados:view_private',
  'documentacion:docs-empleados-permanentes:view',
  'documentacion:documentos-de-equipos:view',
  'documentacion:docs-equipos-permanentes:view',
  'documentacion:documentos-de-empresa:view',
  'documentacion:docs-empresa-permanentes:view',
  'documentacion:detalle-de-documento:view',
];
const LIMITED_KEYS = [
  'equipos:vehicles:view',
  'documentacion:documentos-de-empleados:view',
  'documentacion:docs-empleados-permanentes:view',
];

/** Día argentino `offset` días desde hoy, como timestamptz al mediodía AR. */
function arDay(offset: number): Date {
  const today = argentinaDate();
  const date = new Date(`${today}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

async function call(path: string, userId: string | null, headers: Record<string, string> = {}) {
  const url = new URL(`http://app.test${path}`);
  const req = new Request(url, { headers: { ...(userId ? { authorization: `Bearer ${userId}` } : {}), ...headers } });
  const parts = url.pathname.replace('/api/mobile/v1/', '').split('/').filter(Boolean);
  const [root, a, b, c, d] = parts;
  if (root === 'equipment') {
    if (!a) return (await import('@/app/api/mobile/v1/equipment/route')).GET(req, { params: Promise.resolve({}) });
    if (a === 'filters')
      return (await import('@/app/api/mobile/v1/equipment/filters/route')).GET(req, { params: Promise.resolve({}) });
    return (await import('@/app/api/mobile/v1/equipment/[kind]/[equipmentId]/route')).GET(req, {
      params: Promise.resolve({ kind: a, equipmentId: b! }),
    });
  }
  if (root === 'documents') {
    if (!a) return (await import('@/app/api/mobile/v1/documents/route')).GET(req, { params: Promise.resolve({}) });
    if (a === 'filters')
      return (await import('@/app/api/mobile/v1/documents/filters/route')).GET(req, { params: Promise.resolve({}) });
    const params = Promise.resolve({ resource: a, documentId: b! });
    if (c === 'file' && d === 'content')
      return (await import('@/app/api/mobile/v1/documents/[resource]/[documentId]/file/content/route')).GET(req, {
        params,
      });
    if (c === 'file')
      return (await import('@/app/api/mobile/v1/documents/[resource]/[documentId]/file/route')).GET(req, { params });
    return (await import('@/app/api/mobile/v1/documents/[resource]/[documentId]/route')).GET(req, { params });
  }
  if (root === 'me') return (await import('@/app/api/mobile/v1/me/route')).GET(req, { params: Promise.resolve({}) });
  return (await import('@/app/api/mobile/v1/capabilities/route')).GET(req, { params: Promise.resolve({}) });
}

async function json<T>(path: string, userId: string | null): Promise<{ status: number; body: T }> {
  const response = await call(path, userId);
  return { status: response.status, body: (await response.json()) as T };
}

type EquipmentList = { items: { id: string; docStatus: unknown }[]; nextCursor: string | null; total: number | null };
type DocumentList = {
  items: { id: string; status: string; hasDetail: boolean; resource: { kind: string; fileNumber: string | null } }[];
  nextCursor: string | null;
  total: number | null;
};

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.$executeRaw`DELETE FROM documents_employees WHERE applies IN (SELECT id FROM employees WHERE company_id = ANY(${companies}::uuid[]))`;
  await owner.$executeRaw`DELETE FROM documents_equipment WHERE applies IN (SELECT id FROM vehicles WHERE company_id = ANY(${companies}::uuid[]))`;
  await owner.documents_company.deleteMany({ where: { applies: { in: companies } } });
  await owner.contractor_equipment.deleteMany({ where: { contractor_id: CUSTOMER } });
  await owner.other_equipment_certifications.deleteMany({ where: { company_id: { in: companies } } });
  await owner.other_equipment.deleteMany({ where: { company_id: { in: companies } } });
  await owner.vehicles.deleteMany({ where: { company_id: { in: companies } } });
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await owner.document_types.deleteMany({ where: { company_id: { in: companies } } });
  await owner.type.deleteMany({ where: { company_id: { in: companies } } });
  await owner.customers.deleteMany({ where: { company_id: { in: companies } } });
  await owner.equipment_owners.deleteMany({ where: { company_id: { in: companies } } });
  await owner.company_modules.deleteMany({ where: { company_id: { in: companies } } });
  await dropTestUsers(owner, [FULL, LIMITED, FULL_B]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

describe.skipIf(!RUN_RLS)('API móvil de equipos y documentación bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    vi.stubEnv('MOBILE_API_ENABLED', 'true');
    if (!process.env.BETTER_AUTH_SECRET) vi.stubEnv('BETTER_AUTH_SECRET', 'secreto-de-prueba-de-la-api-movil');
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY_A, name: '__rls_movil_eq_A__', cuit: 'RLS-MOVEQ-A', cityId: city.id });
    await createTestCompany(owner, { id: COMPANY_B, name: '__rls_movil_eq_B__', cuit: 'RLS-MOVEQ-B', cityId: city.id });

    await owner.type.createMany({
      data: [
        { id: TYPE_V, name: 'Camioneta prueba', company_id: COMPANY_A, applies_to: 'vehicle' },
        { id: TYPE_O, name: 'Contenedor prueba', company_id: COMPANY_A, applies_to: 'other_equipment' },
      ],
    });
    await owner.equipment_owners.create({
      data: { id: OWNER, name: 'Titular SA', cuit: '30111111118', contract_type: 'Leasing', company_id: COMPANY_A },
    });
    await owner.customers.create({ data: { id: CUSTOMER, name: 'Cliente Norte', cuit: BigInt('30222222229'), company_id: COMPANY_A } });
    const vehicle = (vid: string, company: string, domain: string | null, extra: Record<string, unknown> = {}) => ({
      id: vid,
      company_id: company,
      type_of_vehicle: BigInt(1),
      type: TYPE_V,
      engine: 'motor-x',
      year: '2021',
      domain,
      serie: domain ? null : `SERIE-${vid.slice(-2)}`,
      condition: 'operativo' as const,
      ...extra,
    });
    await owner.vehicles.createMany({
      data: [
        vehicle(V_AA111AA, COMPANY_A, 'AA111AA', { owner_id: OWNER, intern_number: 'I-10' }),
        vehicle(V_NULL_1, COMPANY_A, null, { condition: 'no_operativo' }),
        vehicle(V_AA111AB, COMPANY_A, 'AA111AB'),
        vehicle(V_SPACES, COMPANY_A, 'AB 123 CD'),
        vehicle(V_NULL_2, COMPANY_A, null),
        vehicle(V_INACTIVE, COMPANY_A, 'ZZ999ZZ', { is_active: false, termination_date: new Date('2026-01-10T00:00:00Z') }),
        vehicle(V_B, COMPANY_B, 'BB111BB', { type: TYPE_V }),
      ],
    });
    await owner.contractor_equipment.create({ data: { equipment_id: V_AA111AA, contractor_id: CUSTOMER } });
    await owner.other_equipment.createMany({
      data: [
        { id: O_INT1, company_id: COMPANY_A, type_id: TYPE_O, intern_number: 'INT-1', serial_number: 'SN-1' },
        { id: O_NULL, company_id: COMPANY_A, type_id: TYPE_O, serial_number: 'SN-2' },
      ],
    });
    await owner.other_equipment_certifications.create({
      data: {
        id: CERT,
        company_id: COMPANY_A,
        equipment_id: O_INT1,
        name: 'Prueba hidráulica',
        file_url: '/api/files/document-files/x.pdf',
        expiration_date: new Date(`${argentinaDate(arDay(10))}T00:00:00Z`),
      },
    });

    await createTestEmployee(owner, { id: E1, companyId: COMPANY_A, seed: 7701, lastname: 'Reyna', firstname: 'Isabel', file: '7701' });
    await createTestEmployee(owner, { id: E_B, companyId: COMPANY_B, seed: 7702, lastname: 'Otra', firstname: 'Persona', file: '7701' });
    const docType = (tid: string, company: string, applies: 'Persona' | 'Equipos' | 'Empresa', name: string, extra = {}) => ({
      id: tid,
      company_id: company,
      applies,
      name,
      multiresource: false,
      mandatory: true,
      explired: true,
      special: false,
      ...extra,
    });
    await owner.document_types.createMany({
      data: [
        docType(DT_EMP, COMPANY_A, 'Persona', 'Licencia de conducir'),
        docType(DT_EMP_PRIVATE, COMPANY_A, 'Persona', 'Recibo privado', { private: true, explired: false }),
        docType(DT_EMP_ARCHIVED, COMPANY_A, 'Persona', 'Ya no aplica', { mandatory: false, explired: false }),
        docType(DT_VEH, COMPANY_A, 'Equipos', 'Seguro'),
        docType(DT_COMPANY, COMPANY_A, 'Empresa', 'Habilitación', { explired: false }),
        docType(DT_B, COMPANY_B, 'Persona', 'Licencia B'),
      ],
    });
    // Los triggers crean filas pendientes sin archivo al dar de alta recursos/tipos: el motor las ignora.
    await owner.documents_employees.createMany({
      data: [
        { id: DOC_EMP, applies: E1, id_document_types: DT_EMP, state: 'aprobado', validity: arDay(10), document_path: 'emp/lic.pdf', company_id: COMPANY_A },
        { id: DOC_EMP_PRIVATE, applies: E1, id_document_types: DT_EMP_PRIVATE, state: 'aprobado', document_path: 'emp/priv.pdf', company_id: COMPANY_A },
        { id: DOC_EMP_ARCHIVED, applies: E1, id_document_types: DT_EMP_ARCHIVED, state: 'aprobado', document_path: 'emp/arch.pdf', archived_at: new Date(), company_id: COMPANY_A },
        { id: DOC_B, applies: E_B, id_document_types: DT_B, state: 'aprobado', validity: arDay(100), document_path: 'emp/b.pdf', company_id: COMPANY_B },
      ],
    });
    await owner.documents_equipment.create({
      data: { id: DOC_VEH, applies: V_AA111AA, id_document_types: DT_VEH, state: 'aprobado', validity: arDay(-3), document_path: 'veh/seguro.pdf', policy_number: 'POL-9', company_id: COMPANY_A },
    });

    for (const [uid, company] of [
      [FULL, COMPANY_A],
      [LIMITED, COMPANY_A],
      [FULL_B, COMPANY_B],
    ] as const) {
      await createTestUser(owner, { id: uid, email: `${uid.slice(-4)}@rls-movil-eq.test`, fullname: `Usuario ${uid.slice(-2)}` });
      await owner.share_company_users.create({ data: { company_id: company, profile_id: uid } });
      sessions.set(uid, company);
    }
    await grantPermissions(owner, catalog, { userId: FULL, companyId: COMPANY_A, keys: FULL_KEYS });
    await grantPermissions(owner, catalog, { userId: FULL_B, companyId: COMPANY_B, keys: FULL_KEYS });
    await grantPermissions(owner, catalog, { userId: LIMITED, companyId: COMPANY_A, keys: LIMITED_KEYS });
  }, 90_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanup();
    await dropCatalogRows(owner, catalog);
    await owner.$disconnect();
  });

  it('`/capabilities` y `/me` anuncian los módulos nuevos y los permisos de cada uno', async () => {
    const caps = await json<{ modules: string[] }>('/api/mobile/v1/capabilities', null);
    expect(caps.body.modules).toEqual(expect.arrayContaining(['equipos.equipment', 'documentacion.documents']));
    const me = await json<{
      modules: string[];
      permissions: { equipos: { vehicles: { record: boolean } }; documentacion: { resources: string[]; detail: boolean } };
    }>('/api/mobile/v1/me', FULL);
    expect(me.status).toBe(200);
    expect(me.body.modules).toEqual(expect.arrayContaining(['equipos.equipment', 'documentacion.documents']));
    expect(me.body.permissions.equipos.vehicles.record).toBe(true);
    expect(me.body.permissions.documentacion).toMatchObject({ resources: ['employee', 'equipment', 'company'], detail: true });
    const limited = await json<{ permissions: { documentacion: { resources: string[]; detail: boolean } } }>(
      '/api/mobile/v1/me',
      LIMITED
    );
    expect(limited.body.permissions.documentacion).toMatchObject({ resources: ['employee'], detail: false });
  });

  it('401 sin token; 403 sin el permiso web equivalente', async () => {
    expect((await call('/api/mobile/v1/equipment', null)).status).toBe(401);
    expect((await call('/api/mobile/v1/documents', null)).status).toBe(401);
    expect((await call('/api/mobile/v1/equipment?kind=other', LIMITED)).status).toBe(403);
    expect((await call('/api/mobile/v1/equipment?status=inactive', LIMITED)).status).toBe(403);
    expect((await call(`/api/mobile/v1/equipment/vehicle/${V_AA111AA}`, LIMITED)).status).toBe(403);
    expect((await call('/api/mobile/v1/documents?resource=equipment', LIMITED)).status).toBe(403);
    expect((await call(`/api/mobile/v1/documents/employee/${DOC_EMP}`, LIMITED)).status).toBe(403);
    expect((await call(`/api/mobile/v1/documents/employee/${DOC_EMP}/file`, LIMITED)).status).toBe(403);
  });

  it('equipos: cada empresa ve solo lo suyo; la ficha de otra empresa es 404', async () => {
    const a = await json<EquipmentList>('/api/mobile/v1/equipment?limit=50', FULL);
    expect(equipmentListResponseSchema.strict().safeParse(a.body).success).toBe(true);
    expect(a.body.items.map((i) => i.id).sort()).toEqual([...ACTIVE_VEHICLES_A].sort());
    expect(a.body.total).toBe(ACTIVE_VEHICLES_A.length);
    const b = await json<EquipmentList>('/api/mobile/v1/equipment?limit=50', FULL_B);
    expect(b.body.items.map((i) => i.id)).toEqual([V_B]);
    expect((await call(`/api/mobile/v1/equipment/vehicle/${V_B}`, FULL)).status).toBe(404);
    expect((await call(`/api/mobile/v1/equipment/vehicle/${V_AA111AA}`, FULL_B)).status).toBe(404);
    const inactive = await json<EquipmentList>('/api/mobile/v1/equipment?status=inactive', FULL);
    expect(inactive.body.items.map((i) => i.id)).toEqual([V_INACTIVE]);
    const others = await json<EquipmentList>('/api/mobile/v1/equipment?kind=other', FULL);
    expect(others.body.items.map((i) => i.id)).toEqual([O_INT1, O_NULL]);
  });

  it('equipos: paginación por cursor con dominios nulos (al final) y empates, sin duplicados ni saltos', async () => {
    const all = (await json<EquipmentList>('/api/mobile/v1/equipment?limit=50', FULL)).body.items.map((i) => i.id);
    expect(all.slice(-2).sort()).toEqual([V_NULL_1, V_NULL_2].sort());
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { body: EquipmentList } = await json<EquipmentList>(
        `/api/mobile/v1/equipment?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        FULL
      );
      if (pages > 0) expect(page.body.total).toBeNull();
      ids.push(...page.body.items.map((i) => i.id));
      cursor = page.body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(ids).toEqual(all);
    // Un cursor de vehículos no sirve para el equipamiento.
    const first = (await json<EquipmentList>('/api/mobile/v1/equipment?limit=2', FULL)).body;
    expect((await call(`/api/mobile/v1/equipment?kind=other&cursor=${first.nextCursor}`, FULL)).status).toBe(422);
  });

  it('equipos: búsqueda por patente (con o sin espacios), interno, y filtros por tipo y condición', async () => {
    const search = async (q: string) =>
      (await json<EquipmentList>(`/api/mobile/v1/equipment?limit=50&${q}`, FULL)).body.items.map((i) => i.id).sort();
    await expect(search('q=aa111')).resolves.toEqual([V_AA111AA, V_AA111AB].sort());
    await expect(search('q=AB%20123')).resolves.toEqual([V_SPACES]);
    await expect(search('q=I-10')).resolves.toEqual([V_AA111AA]);
    await expect(search('condition=no_operativo')).resolves.toEqual([V_NULL_1]);
    await expect(search(`typeId=${TYPE_V}`)).resolves.toEqual([...ACTIVE_VEHICLES_A].sort());
    // Nunca trae de otra empresa.
    await expect(search('q=BB111')).resolves.toEqual([]);
  });

  it('equipos: ficha con datos técnicos, titular, cliente asignado y documentos con vencimiento', async () => {
    const { status, body } = await json<{
      technical: { owner: { name: string }; domain: string };
      assignment: { customers: { name: string }[] };
      documents: { permanent: { id: string; status: string; validity: string }[] } | null;
    }>(`/api/mobile/v1/equipment/vehicle/${V_AA111AA}`, FULL);
    expect(status).toBe(200);
    expect(equipmentDetailResponseSchema.strict().safeParse(body).success).toBe(true);
    expect(body.technical.owner.name).toBe('Titular SA');
    expect(body.assignment.customers.map((c) => c.name)).toEqual(['Cliente Norte']);
    const seguro = body.documents?.permanent.find((d) => d.id === DOC_VEH);
    expect(seguro).toMatchObject({ status: 'expired', validity: argentinaDate(arDay(-3)) });

    const other = await json<{ certifications: { id: string; status: string }[] | null; assignment?: unknown }>(
      `/api/mobile/v1/equipment/other/${O_INT1}`,
      FULL
    );
    expect(other.status).toBe(200);
    expect(other.body.certifications).toEqual([expect.objectContaining({ id: CERT, status: 'expiring' })]);
    // Sin `asignacion-otro`, el bloque no viaja.
    expect(other.body).not.toHaveProperty('assignment');

    const filters = await json('/api/mobile/v1/equipment/filters', FULL);
    expect(equipmentFiltersResponseSchema.strict().safeParse(filters.body).success).toBe(true);
  });

  it('documentos: estados del motor, legajo siempre, privados solo con view_private y archivados fuera', async () => {
    const list = await json<DocumentList>('/api/mobile/v1/documents?limit=50', FULL);
    expect(list.status).toBe(200);
    expect(documentListResponseSchema.strict().safeParse(list.body).success).toBe(true);
    const ids = list.body.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([DOC_EMP, DOC_EMP_PRIVATE, DOC_VEH]));
    expect(ids).not.toContain(DOC_EMP_ARCHIVED);
    expect(ids).not.toContain(DOC_B);
    const byId = new Map(list.body.items.map((i) => [i.id, i]));
    expect(byId.get(DOC_EMP)).toMatchObject({ status: 'expiring', resource: { kind: 'employee', fileNumber: '7701' } });
    expect(byId.get(DOC_VEH)).toMatchObject({ status: 'expired' });
    // Faltantes sintéticos (sin ficha): el seguro de los vehículos sin documento y la habilitación de la empresa.
    const missing = list.body.items.filter((i) => i.status === 'missing');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((i) => !i.hasDetail && i.id.startsWith('missing:'))).toBe(true);
    expect(missing.some((i) => i.resource.kind === 'company')).toBe(true);
    // Lo que pide acción primero.
    expect(list.body.items[0]?.status).toBe('missing');

    const limited = await json<DocumentList>('/api/mobile/v1/documents?limit=50', LIMITED);
    expect(limited.body.items.every((i) => i.resource.kind === 'employee')).toBe(true);
    expect(limited.body.items.map((i) => i.id)).toContain(DOC_EMP);
    expect(limited.body.items.map((i) => i.id)).not.toContain(DOC_EMP_PRIVATE);

    const expiring = await json<DocumentList>('/api/mobile/v1/documents?status=expiring', FULL);
    expect(expiring.body.items.map((i) => i.id)).toEqual([DOC_EMP]);
    const search = await json<DocumentList>('/api/mobile/v1/documents?q=7701', FULL);
    expect(search.body.items.map((i) => i.id).sort()).toEqual([DOC_EMP, DOC_EMP_PRIVATE].sort());

    const filters = await json('/api/mobile/v1/documents/filters', FULL);
    expect(documentFiltersResponseSchema.strict().safeParse(filters.body).success).toBe(true);
  });

  it('documentos: paginación por cursor sin duplicados ni saltos', async () => {
    const all = (await json<DocumentList>('/api/mobile/v1/documents?limit=50', FULL)).body.items.map((i) => i.id);
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { body: DocumentList } = await json<DocumentList>(
        `/api/mobile/v1/documents?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        FULL
      );
      ids.push(...page.body.items.map((i) => i.id));
      cursor = page.body.nextCursor;
      pages++;
    } while (cursor && pages < 20);
    expect(ids).toEqual(all);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('documentos: ficha y archivo firmado; archivados, de otra empresa o alterados no se sirven', async () => {
    const detail = await json<{ resource: { fileNumber: string }; hasFile: boolean; status: string }>(
      `/api/mobile/v1/documents/employee/${DOC_EMP}`,
      FULL
    );
    expect(detail.status).toBe(200);
    expect(documentDetailResponseSchema.strict().safeParse(detail.body).success).toBe(true);
    expect(detail.body).toMatchObject({ resource: { fileNumber: '7701' }, hasFile: true, status: 'expiring' });
    expect((await call(`/api/mobile/v1/documents/employee/${DOC_EMP_ARCHIVED}`, FULL)).status).toBe(404);
    expect((await call(`/api/mobile/v1/documents/employee/${DOC_B}`, FULL)).status).toBe(404);
    expect((await call(`/api/mobile/v1/documents/equipment/${DOC_EMP}`, FULL)).status).toBe(404);

    const link = await json<{ url: string; fileName: string }>(`/api/mobile/v1/documents/employee/${DOC_EMP}/file`, FULL);
    expect(link.status).toBe(200);
    expect(link.body.fileName).toBe('Licencia de conducir.pdf');
    s3Keys.length = 0;
    const file = await call(link.body.url, null);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    // El path sale de la base, no de la URL.
    expect(s3Keys).toEqual(['emp/lic.pdf']);

    const tamper = (mutate: (url: URL) => void) => {
      const url = new URL(`http://app.test${link.body.url}`);
      mutate(url);
      return call(`${url.pathname}${url.search}`, null);
    };
    expect((await tamper((u) => u.searchParams.set('c', COMPANY_B))).status).toBe(403);
    expect((await tamper((u) => (u.pathname = u.pathname.replace(DOC_EMP, DOC_B)))).status).toBe(403);
    expect((await tamper((u) => u.searchParams.set('exp', String(Math.floor(Date.now() / 1000) - 60)))).status).toBe(403);
  });

  it('módulos: `equipos` o `documentacion` apagados en A responden 404 MODULE_DISABLED solo a A', async () => {
    const switchOff = (moduleKey: string) =>
      owner.company_modules.upsert({
        where: { company_id_module_key: { company_id: COMPANY_A, module_key: moduleKey } },
        create: { company_id: COMPANY_A, module_key: moduleKey, enabled: false, changed_by: 'test', reason: 'test' },
        update: { enabled: false },
      });
    const link = await json<{ url: string }>(`/api/mobile/v1/documents/employee/${DOC_EMP}/file`, FULL);
    try {
      await switchOff('documentacion');
      for (const path of ['/api/mobile/v1/documents', `/api/mobile/v1/documents/employee/${DOC_EMP}`]) {
        const off = await json<{ error: { code: string } }>(path, FULL);
        expect(off.status).toBe(404);
        expect(off.body.error.code).toBe('MODULE_DISABLED');
      }
      expect((await call(link.body.url, null)).status).toBe(404);
      // Equipos sigue, pero sin estado documental ni documentos.
      const list = await json<EquipmentList>('/api/mobile/v1/equipment?limit=50', FULL);
      expect(list.status).toBe(200);
      expect(list.body.items.every((i) => i.docStatus === null)).toBe(true);
      const detail = await json<{ documents: unknown }>(`/api/mobile/v1/equipment/vehicle/${V_AA111AA}`, FULL);
      expect(detail.body.documents).toBeNull();
      const me = await json<{ modules: string[] }>('/api/mobile/v1/me', FULL);
      expect(me.body.modules).not.toContain('documentacion.documents');
      expect((await call('/api/mobile/v1/documents', FULL_B)).status).toBe(200);

      await owner.company_modules.deleteMany({ where: { company_id: COMPANY_A } });
      await switchOff('equipos');
      const off = await json<{ error: { code: string } }>('/api/mobile/v1/equipment', FULL);
      expect(off.status).toBe(404);
      expect(off.body.error.code).toBe('MODULE_DISABLED');
      // Documentos de equipos: la clase desaparece (la de empleados sigue) y su ficha es 404.
      const docs = await json<DocumentList>('/api/mobile/v1/documents?limit=50', FULL);
      expect(docs.body.items.some((i) => i.resource.kind === 'equipment')).toBe(false);
      expect(docs.body.items.some((i) => i.resource.kind === 'employee')).toBe(true);
      expect((await call(`/api/mobile/v1/documents/equipment/${DOC_VEH}`, FULL)).status).toBe(404);
      expect((await call('/api/mobile/v1/equipment', FULL_B)).status).toBe(200);
    } finally {
      await owner.company_modules.deleteMany({ where: { company_id: COMPANY_A } });
    }
    expect((await call('/api/mobile/v1/equipment?limit=1', FULL)).status).toBe(200);
  });
});
