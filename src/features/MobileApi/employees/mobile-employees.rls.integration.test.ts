import {
  employeeDetailResponseSchema,
  employeeListItemSchema,
  employeeListResponseSchema,
} from '@/features/MobileApi/contracts/employees';
import type { PrismaClient } from '@/generated/prisma/client';
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
 * API móvil de Empleados (808, solo lectura) por las rutas reales, bajo el rol REAL de la app, con dos empresas.
 *
 * Solo se sustituye la verificación del token de Better Auth (`auth.api.getSession`): el resto —bloqueo de usuarios,
 * permisos leídos de la base con la regla de la web, consultas con RLS, validación de salida, ETag y la firma de las
 * fotos— corre de verdad. El token de prueba es `Bearer <userId>`.
 *
 * Corre con `scripts/test-rls.sh`.
 */
const sessions = vi.hoisted(() => new Map<string, string>());

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

const COMPANY_A = '7c300000-0000-4000-8000-00000000000a';
const COMPANY_B = '7c300000-0000-4000-8000-00000000000b';
const FULL = '7c300000-0000-4000-8000-0000000001a1';
const LIST_ONLY = '7c300000-0000-4000-8000-0000000001a2';
const NONE = '7c300000-0000-4000-8000-0000000001a3';
const BANNED = '7c300000-0000-4000-8000-0000000001a4';
const FULL_B = '7c300000-0000-4000-8000-0000000001b1';

/** 1×1 PNG. */
const PICTURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Empleados de A con empates a propósito en apellido+nombre, legajo y fecha de ingreso (el desempate es el id). */
const EMPLOYEES_A = [
  { n: 1, lastname: 'Gomez', firstname: 'Ana', file: '7601', admission: '2021-05-01' },
  { n: 2, lastname: 'Gomez', firstname: 'Ana', file: '7601', admission: '2021-05-01' },
  { n: 3, lastname: 'Gomez', firstname: 'Ana', file: '7603', admission: '2020-01-01' },
  { n: 4, lastname: 'Acosta', firstname: 'Luis', file: '7604', admission: '2021-05-01' },
  { n: 5, lastname: 'Zarate', firstname: 'Bea', file: '7605', admission: '2019-03-03' },
  { n: 6, lastname: 'Gomez', firstname: 'Bruno', file: '7606', admission: '2022-07-07' },
  { n: 7, lastname: 'Paz', firstname: 'Ana', file: '7607', admission: '2020-01-01' },
] as const;
const employeeId = (n: number) => `7c300000-0000-4000-8000-0000000002${n.toString().padStart(2, '0')}`;
const INACTIVE_A = employeeId(8);
const EMPLOYEE_B = employeeId(9);

let owner: PrismaClient;
const catalog = emptyCatalogRows();

const FULL_KEYS = [
  'empleados:empleados-activos:view',
  'empleados:empleados-inactivos:view',
  'empleados:employees:view',
  'empleados:datos-personales:view',
  'empleados:datos-laborales:view',
];

async function get(path: string, userId: string | null, headers: Record<string, string> = {}) {
  const url = new URL(`http://app.test${path}`);
  const req = new Request(url, { headers: { ...(userId ? { authorization: `Bearer ${userId}` } : {}), ...headers } });
  const segments = url.pathname.replace('/api/mobile/v1/employees', '').split('/').filter(Boolean);
  if (segments.length === 0) {
    const { GET } = await import('@/app/api/mobile/v1/employees/route');
    return GET(req, { params: Promise.resolve({}) });
  }
  if (segments[1] === 'photo') {
    const { GET } = await import('@/app/api/mobile/v1/employees/[employeeId]/photo/route');
    return GET(req, { params: Promise.resolve({ employeeId: segments[0]! }) });
  }
  const { GET } = await import('@/app/api/mobile/v1/employees/[employeeId]/route');
  return GET(req, { params: Promise.resolve({ employeeId: segments[0]! }) });
}

type ListBody = {
  items: { id: string; photo: { url: string } | null }[];
  nextCursor: string | null;
  total: number | null;
};

/** Recorre todas las páginas de un orden con `limit` chico. */
async function walk(
  sort: string,
  limit: number,
  extra = ''
): Promise<{ ids: string[]; pages: number; firstTotal: number | null }> {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let firstTotal: number | null = null;
  do {
    const query = `?sort=${sort}&limit=${limit}${extra}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response = await get(`/api/mobile/v1/employees${query}`, FULL);
    expect(response.status).toBe(200);
    const body = (await response.json()) as ListBody;
    if (pages === 0) firstTotal = body.total;
    else expect(body.total).toBeNull();
    ids.push(...body.items.map((item) => item.id));
    cursor = body.nextCursor;
    pages++;
  } while (cursor && pages < 20);
  return { ids, pages, firstTotal };
}

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await dropTestUsers(owner, [FULL, LIST_ONLY, NONE, BANNED, FULL_B]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

describe.skipIf(!RUN_RLS)('API móvil de empleados bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    vi.stubEnv('MOBILE_API_ENABLED', 'true');
    if (!process.env.BETTER_AUTH_SECRET) vi.stubEnv('BETTER_AUTH_SECRET', 'secreto-de-prueba-de-la-api-movil');
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY_A, name: '__rls_movil_A__', cuit: 'RLS-MOVIL-A', cityId: city.id });
    await createTestCompany(owner, { id: COMPANY_B, name: '__rls_movil_B__', cuit: 'RLS-MOVIL-B', cityId: city.id });
    for (const e of EMPLOYEES_A) {
      await createTestEmployee(owner, {
        id: employeeId(e.n),
        companyId: COMPANY_A,
        seed: 7600 + e.n,
        lastname: e.lastname,
        firstname: e.firstname,
        file: e.file,
        admission: e.admission,
      });
    }
    await owner.employees.update({ where: { id: employeeId(1) }, data: { picture: PICTURE } });
    await createTestEmployee(owner, {
      id: INACTIVE_A,
      companyId: COMPANY_A,
      seed: 7608,
      lastname: 'Baja',
      firstname: 'Dada',
      isActive: false,
    });
    await createTestEmployee(owner, {
      id: EMPLOYEE_B,
      companyId: COMPANY_B,
      seed: 7609,
      lastname: 'Gomez',
      firstname: 'Ana',
      file: '7601',
    });
    await owner.employees.update({ where: { id: EMPLOYEE_B }, data: { picture: PICTURE } });

    for (const [id, company] of [
      [FULL, COMPANY_A],
      [LIST_ONLY, COMPANY_A],
      [NONE, COMPANY_A],
      [BANNED, COMPANY_A],
      [FULL_B, COMPANY_B],
    ] as const) {
      await createTestUser(owner, { id, email: `${id.slice(-4)}@rls-movil.test`, fullname: `Usuario ${id.slice(-2)}` });
      await owner.share_company_users.create({ data: { company_id: company, profile_id: id } });
      sessions.set(id, company);
    }
    await owner.user.update({ where: { id: BANNED }, data: { banned: true } });
    await grantPermissions(owner, catalog, { userId: FULL, companyId: COMPANY_A, keys: FULL_KEYS });
    await grantPermissions(owner, catalog, { userId: BANNED, companyId: COMPANY_A, keys: FULL_KEYS });
    await grantPermissions(owner, catalog, { userId: FULL_B, companyId: COMPANY_B, keys: FULL_KEYS });
    await grantPermissions(owner, catalog, {
      userId: LIST_ONLY,
      companyId: COMPANY_A,
      keys: ['empleados:empleados-activos:view'],
    });
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanup();
    await dropCatalogRows(owner, catalog);
    await owner.$disconnect();
  });

  it('401 sin token, con token desconocido o con el usuario bloqueado', async () => {
    for (const user of [null, '7c300000-0000-4000-8000-000000000999', BANNED]) {
      const response = await get('/api/mobile/v1/employees', user);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    }
  });

  it('403 sin el permiso web equivalente: listado, bajas y legajo', async () => {
    expect((await get('/api/mobile/v1/employees', NONE)).status).toBe(403);
    expect((await get('/api/mobile/v1/employees?status=inactive', LIST_ONLY)).status).toBe(403);
    expect((await get(`/api/mobile/v1/employees/${employeeId(1)}`, NONE)).status).toBe(403);
    expect((await get('/api/mobile/v1/employees', LIST_ONLY)).status).toBe(200);
    // Como en la web: el `view` de una subpestaña hace visible el legajo (visibilidad inferida), pero los bloques sin
    // permiso no viajan.
    const detail = await get(`/api/mobile/v1/employees/${employeeId(1)}`, LIST_ONLY);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('personal');
    expect(body).not.toHaveProperty('contact');
    expect(body).not.toHaveProperty('work');
  });

  it('cada empresa ve solo lo suyo; el legajo de otra empresa es 404', async () => {
    const a = (await (await get('/api/mobile/v1/employees?limit=50', FULL)).json()) as ListBody;
    expect(a.items.map((i) => i.id).sort()).toEqual(EMPLOYEES_A.map((e) => employeeId(e.n)).sort());
    expect(a.total).toBe(EMPLOYEES_A.length);
    const b = (await (await get('/api/mobile/v1/employees?limit=50', FULL_B)).json()) as ListBody;
    expect(b.items.map((i) => i.id)).toEqual([EMPLOYEE_B]);
    expect((await get(`/api/mobile/v1/employees/${EMPLOYEE_B}`, FULL)).status).toBe(404);
    expect((await get(`/api/mobile/v1/employees/${employeeId(1)}`, FULL_B)).status).toBe(404);
    const inactive = (await (await get('/api/mobile/v1/employees?status=inactive', FULL)).json()) as ListBody;
    expect(inactive.items.map((i) => i.id)).toEqual([INACTIVE_A]);
  });

  it.each(['name', 'file', 'admission'])(
    'paginación por cursor (orden %s): sin duplicados ni saltos, con empates',
    async (sort) => {
      const all = await walk(sort, 50);
      expect(all.pages).toBe(1);
      const paged = await walk(sort, 2);
      expect(paged.pages).toBe(Math.ceil(EMPLOYEES_A.length / 2));
      expect(paged.firstTotal).toBe(EMPLOYEES_A.length);
      expect(new Set(paged.ids).size).toBe(paged.ids.length);
      expect(paged.ids).toEqual(all.ids);
      // Un cursor de otro orden se rechaza.
      const first = (await (await get(`/api/mobile/v1/employees?sort=${sort}&limit=2`, FULL)).json()) as ListBody;
      const other = sort === 'name' ? 'file' : 'name';
      expect((await get(`/api/mobile/v1/employees?sort=${other}&cursor=${first.nextCursor}`, FULL)).status).toBe(422);
    }
  );

  it('búsqueda por nombre (en cualquier orden), legajo, CUIL y DNI', async () => {
    const search = async (q: string) =>
      (
        (await (await get(`/api/mobile/v1/employees?limit=50&q=${encodeURIComponent(q)}`, FULL)).json()) as ListBody
      ).items
        .map((i) => i.id)
        .sort();
    const anaGomez = [1, 2, 3].map(employeeId).sort();
    await expect(search('gomez ana')).resolves.toEqual(anaGomez);
    await expect(search('ANA GOMEZ')).resolves.toEqual(anaGomez);
    await expect(search('7606')).resolves.toEqual([employeeId(6)]);
    // CUIL y DNI con separadores (los arma `createTestEmployee`: CUIL 2099<seed>0001, DNI 99<seed>01).
    await expect(search('2099-7605-0001')).resolves.toEqual([employeeId(5)]);
    await expect(search('99.7604.01')).resolves.toEqual([employeeId(4)]);
    // Nunca trae de otra empresa (B tiene una Ana Gomez con el mismo legajo).
    await expect(search('7601')).resolves.toEqual([1, 2].map(employeeId).sort());
  });

  it('las respuestas cumplen su schema y no llevan campos fuera del contrato', async () => {
    const list = await (await get('/api/mobile/v1/employees?limit=50', FULL)).json();
    expect(employeeListResponseSchema.strict().safeParse(list).success).toBe(true);
    for (const item of (list as ListBody).items) {
      expect(Object.keys(item).sort()).toEqual(Object.keys(employeeListItemSchema.shape).sort());
    }
    const detail = await (await get(`/api/mobile/v1/employees/${employeeId(1)}`, FULL)).json();
    expect(employeeDetailResponseSchema.strict().safeParse(detail).success).toBe(true);
    // Sin permiso de contacto, el bloque no viaja (ni vacío); sí los que tiene.
    expect(Object.keys(detail)).not.toContain('contact');
    expect(Object.keys(detail)).toEqual(expect.arrayContaining(['personal', 'work']));
  });

  it('ETag: la misma respuesta con If-None-Match es 304 sin cuerpo', async () => {
    const first = await get(`/api/mobile/v1/employees/${employeeId(3)}`, FULL);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect(first.headers.get('cache-control')).toBe('private, no-cache');
    const second = await get(`/api/mobile/v1/employees/${employeeId(3)}`, FULL, { 'if-none-match': etag! });
    expect(second.status).toBe(304);
    await expect(second.text()).resolves.toBe('');
    // Otro recurso, otra huella.
    const other = await get(`/api/mobile/v1/employees/${employeeId(4)}`, FULL, { 'if-none-match': etag! });
    expect(other.status).toBe(200);
  });

  it('foto firmada: sirve la propia; alterar empresa, empleado o vencimiento es 403', async () => {
    const list = (await (await get('/api/mobile/v1/employees?limit=50', FULL)).json()) as ListBody;
    const photoUrl = list.items.find((i) => i.id === employeeId(1))?.photo?.url;
    expect(photoUrl).toBeTruthy();
    const ok = await get(photoUrl!, null);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');

    const tamper = (mutate: (url: URL) => void) => {
      const url = new URL(`http://app.test${photoUrl}`);
      mutate(url);
      return get(`${url.pathname}${url.search}`, null);
    };
    // La firma de A no sirve para la foto de otra empresa (aunque sea el mismo empleado o uno de B).
    expect((await tamper((u) => u.searchParams.set('c', COMPANY_B))).status).toBe(403);
    expect((await tamper((u) => (u.pathname = `/api/mobile/v1/employees/${EMPLOYEE_B}/photo`))).status).toBe(403);
    expect((await tamper((u) => u.searchParams.set('exp', String(Math.floor(Date.now() / 1000) - 60)))).status).toBe(
      403
    );
  });

  it('módulos (F3.3): con `empleados` apagado en A responde 404 MODULE_DISABLED solo a A, y `documentacion` apagada oculta el estado documental', async () => {
    const switchOff = (moduleKey: string) =>
      owner.company_modules.upsert({
        where: { company_id_module_key: { company_id: COMPANY_A, module_key: moduleKey } },
        create: { company_id: COMPANY_A, module_key: moduleKey, enabled: false, changed_by: 'test', reason: 'test' },
        update: { enabled: false },
      });
    try {
      await switchOff('documentacion');
      const list = (await (await get('/api/mobile/v1/employees?limit=50', FULL)).json()) as {
        items: { id: string; docStatus: unknown; photo: { url: string } | null }[];
      };
      expect(list.items.length).toBeGreaterThan(0);
      expect(list.items.every((item) => item.docStatus === null)).toBe(true);
      const photoUrl = list.items.find((item) => item.id === employeeId(1))?.photo?.url;
      expect(photoUrl).toBeTruthy();
      expect((await get(photoUrl!, null)).status).toBe(200);
      const { GET: getFilters } = await import('@/app/api/mobile/v1/employees/filters/route');
      const filters = (await (
        await getFilters(
          new Request('http://app.test/api/mobile/v1/employees/filters', {
            headers: { authorization: `Bearer ${FULL}` },
          }),
          { params: Promise.resolve({}) }
        )
      ).json()) as { docStatuses: unknown[] };
      expect(filters.docStatuses).toEqual([]);

      await owner.company_modules.deleteMany({ where: { company_id: COMPANY_A } });
      await switchOff('empleados');
      const off = await get('/api/mobile/v1/employees', FULL);
      expect(off.status).toBe(404);
      await expect(off.json()).resolves.toMatchObject({ error: { code: 'MODULE_DISABLED' } });
      // La foto firmada de A también se corta (la empresa sale de la firma); la empresa B sigue sirviendo.
      expect((await get(photoUrl!, null)).status).toBe(404);
      expect((await get('/api/mobile/v1/employees', FULL_B)).status).toBe(200);
    } finally {
      await owner.company_modules.deleteMany({ where: { company_id: COMPANY_A } });
    }
    expect((await get('/api/mobile/v1/employees?limit=1', FULL)).status).toBe(200);
  });
});
