import { buildStorageFileUrl } from '@/shared/lib/storage-url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integración real de la ruta `/api/files/...` contra el Postgres y el RustFS del compose.
 * Corre sólo con `DATABASE_URL` y `S3_ENDPOINT` definidos:
 *
 *   bash scripts/dev-up.sh   # postgres + almacenamiento + buckets
 *   set -a; source .env.docker; set +a
 *   DATABASE_URL=postgresql://alphataco:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/alphataco \
 *   S3_ENDPOINT=http://127.0.0.1:$STORAGE_PORT \
 *   npx vitest run src/app/api/files/files-route.integration.test.ts
 *
 * Lo único que se sustituye es la sesión (sigue siendo Supabase Auth hasta P4): el resto
 * —resolver de dueño, predicado de empresa contra la base y lectura del objeto en RustFS—
 * corre de verdad. Es la única forma de probar el camino que SÍ sirve el archivo: los
 * tests unitarios no distinguen una ruta que valida de una que niega todo.
 */
const RUN = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);

const sessionUserId = { current: null as string | null };
vi.mock('@/shared/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/session')>()),
  getSessionUserId: async () => sessionUserId.current,
  getSessionCompanyClaim: async () => null,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const CREDENTIAL_ID = '99999999-9999-4999-8999-999999999991';
const PROFILE_ID = '99999999-9999-4999-8999-999999999992';
const OTHER_COMPANY = '99999999-9999-4999-8999-999999999993';
const CUSTOMER_ID = '99999999-9999-4999-8999-999999999994';
const CONTRACT_ID = '99999999-9999-4999-8999-999999999995';
/** La key lleva el `<timestamp>_` que antepone `buildContractDocumentPath`. */
const CONTRACT_KEY_NAME = '1758581201234_contrato-anual.pdf';
/** El nombre que el usuario cargó y con el que espera guardar el archivo. */
const CONTRACT_DISPLAY_NAME = 'Contrato Anual 2026.pdf';
let contractKey = '';
const KEY_SUFFIX = 'logo/__integration__.png';
/** Nombre con los caracteres que rompían el doble decode: espacio, paréntesis y `%`. */
const TRICKY_NAME = 'informe (v1) 50%.pdf';

let companyId = '';

/**
 * Pide un archivo POR SU URL, reproduciendo lo que hace Next antes de llamar al handler:
 * parte el catch-all en segmentos y **decodifica cada uno**
 * (`route-matcher.ts`: `match.split('/').map(decode)`).
 *
 * Es importante que el test entre por la URL y no por la key: pasarle `key.split('/')`
 * directamente salteaba justamente el paso que tenía el bug (un segundo `decodeURIComponent`
 * dentro del handler dejaba inalcanzable todo archivo con `%` en el nombre).
 *
 * Cada llamada recarga la ruta: `canUseAsActiveCompany` está memoizado con React `cache()`,
 * que fuera de un request no tiene scope por request y arrastraría el resultado anterior.
 */
async function requestUrl(url: string) {
  const [pathname, query] = url.split('?');
  const rest = pathname.slice('/api/files/'.length);
  const encodedSegments = rest.split('/');
  const bucket = decodeURIComponent(encodedSegments[0]);
  const path = encodedSegments.slice(1).map((segment) => decodeURIComponent(segment));

  vi.resetModules();
  const { GET } = await import('./[bucket]/[...path]/route');
  return GET(new Request(`http://localhost${pathname}${query ? `?${query}` : ''}`), {
    params: Promise.resolve({ bucket, path }),
  });
}

/** Atajo para los casos donde la key no tiene nada que codificar. */
const request = (bucket: string, key: string) => requestUrl(buildStorageFileUrl(bucket, key));

describe.skipIf(!RUN)('GET /api/files/[bucket]/[...path] (integración)', () => {
  beforeAll(async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    const { storageUpload } = await import('@/shared/lib/storage');

    const company = await prisma.company.findFirst({ select: { id: true } });
    if (!company) throw new Error('La base del compose no tiene ninguna empresa: correr `npm run db:seed`');
    companyId = company.id;

    await prisma.profile.upsert({
      where: { id: PROFILE_ID },
      create: { id: PROFILE_ID, credential_id: CREDENTIAL_ID, email: '__integration__@test.local' },
      update: {},
    });
    await prisma.share_company_users.deleteMany({ where: { profile_id: PROFILE_ID } });
    await prisma.share_company_users.create({
      data: { profile_id: PROFILE_ID, company_id: companyId, is_active: true },
    });

    const file = new File([new TextEncoder().encode('bytes del logo')], 'logo.png', { type: 'image/png' });
    await storageUpload('logo', `${companyId}/${KEY_SUFFIX}`, file, { upsert: true });
    await storageUpload('logo', `${OTHER_COMPANY}/${KEY_SUFFIX}`, file, { upsert: true });
    await storageUpload('logo', `${companyId}/${TRICKY_NAME}`, file, { upsert: true });
    // Objeto real SIN fila que lo referencie: prueba que el default sea negar.
    await storageUpload('contract-documents', `${companyId}/__integration__.pdf`, file, { upsert: true });

    // Adjunto de contrato con su fila: la ruta tiene que resolver la empresa por el cliente
    // dueño del contrato y ofrecer el archivo con el nombre de la BASE, no con el de la key.
    contractKey = `${companyId}/${CUSTOMER_ID}/${CONTRACT_ID}/${CONTRACT_KEY_NAME}`;
    await prisma.customers.upsert({
      where: { id: CUSTOMER_ID },
      create: { id: CUSTOMER_ID, name: '__integration__', cuit: BigInt(30999999991), company_id: companyId },
      update: { company_id: companyId },
    });
    await prisma.customer_services.upsert({
      where: { id: CONTRACT_ID },
      // `company_id` explícito: fuera de un request no hay empresa en el contexto de la transacción y el DEFAULT
      // `app_current_company_id()` daría NULL (la columna es NOT NULL desde que se autocompleta por empresa).
      create: { id: CONTRACT_ID, customer_id: CUSTOMER_ID, company_id: companyId },
      update: { customer_id: CUSTOMER_ID, company_id: companyId },
    });
    await prisma.documents_contracts.deleteMany({ where: { contract_id: CONTRACT_ID } });
    await prisma.documents_contracts.create({
      data: {
        name: CONTRACT_DISPLAY_NAME,
        type: 'pdf',
        size: '15 B',
        path: contractKey,
        contract_id: CONTRACT_ID,
      },
    });
    await storageUpload('contract-documents', contractKey, file, { upsert: true });
  });

  afterAll(async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    const { storageRemove } = await import('@/shared/lib/storage');
    await storageRemove('logo', [
      `${companyId}/${KEY_SUFFIX}`,
      `${OTHER_COMPANY}/${KEY_SUFFIX}`,
      `${companyId}/${TRICKY_NAME}`,
    ]);
    await storageRemove('contract-documents', [`${companyId}/__integration__.pdf`, contractKey]);
    await prisma.documents_contracts.deleteMany({ where: { contract_id: CONTRACT_ID } });
    await prisma.customer_services.deleteMany({ where: { id: CONTRACT_ID } });
    await prisma.customers.deleteMany({ where: { id: CUSTOMER_ID } });
    await prisma.share_company_users.deleteMany({ where: { profile_id: PROFILE_ID } });
    await prisma.profile.deleteMany({ where: { id: PROFILE_ID } });
  });

  it('sirve el archivo de la empresa del usuario', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    const response = await request('logo', `${companyId}/${KEY_SUFFIX}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('bytes del logo');
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(response.headers.get('ETag')).toBeTruthy();
  });

  it('ida y vuelta de una key con espacios, paréntesis y `%`', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    const url = buildStorageFileUrl('logo', `${companyId}/${TRICKY_NAME}`);
    // La URL guardada lleva el `%` escapado; si el handler decodificara de nuevo, el
    // archivo sería inalcanzable para siempre.
    expect(url).toContain('50%25');
    const response = await requestUrl(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('bytes del logo');
  });

  it('`?download=1` responde como adjunto, con el nombre del archivo', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    const { buildStorageDownloadUrl } = await import('@/shared/lib/storage-url');
    const response = await requestUrl(buildStorageDownloadUrl('logo', `${companyId}/${TRICKY_NAME}`));
    expect(response.status).toBe(200);
    const disposition = response.headers.get('Content-Disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toContain(encodeURIComponent(TRICKY_NAME));
  });

  it('SIN `?download=1` NO manda Content-Disposition: el archivo se ve, no se baja', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    // Es lo que rompía "Ver" en pre-empleados y el `<embed type="application/pdf">` de
    // contratos: con `attachment` el navegador descarga en vez de renderizar.
    const response = await request('logo', `${companyId}/${KEY_SUFFIX}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBeNull();
  });

  it('el adjunto de contrato se descarga con el nombre de la base, no con el de la key', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    const { buildStorageDownloadUrl } = await import('@/shared/lib/storage-url');
    const response = await requestUrl(buildStorageDownloadUrl('contract-documents', contractKey));
    expect(response.status).toBe(200);
    const disposition = response.headers.get('Content-Disposition') ?? '';
    expect(disposition).toContain(encodeURIComponent(CONTRACT_DISPLAY_NAME));
    // El `<timestamp>_` de la key no llega a la carpeta de descargas del usuario.
    expect(disposition).not.toContain('1758581201234');
  });

  it('el adjunto de contrato también se puede VER (resuelve por el cliente del contrato)', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    const response = await request('contract-documents', contractKey);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBeNull();
  });

  it('404 para el archivo de OTRA empresa, aunque exista en RustFS', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    const response = await request('logo', `${OTHER_COMPANY}/${KEY_SUFFIX}`);
    expect(response.status).toBe(404);
  });

  it('404 (no 500) si un id del path no tiene forma de uuid', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    // `other_equipment.id` es `@db.Uuid`: sin la guarda, Prisma lanza P2023 y la ruta
    // devolvía un 500 con stack en los logs.
    const response = await request('document-files', 'other-equipment-pictures/no-es-uuid/x.jpg');
    expect(response.status).toBe(404);
  });

  it('404 para un bucket sin resolver de dueño, aunque el objeto exista', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    // `contract-documents` se sirve por la ruta sólo si hay una fila que referencie el path;
    // este objeto no la tiene, así que el default es negar.
    const response = await request('contract-documents', `${companyId}/__integration__.pdf`);
    expect(response.status).toBe(404);
  });

  it('404 para un `document-files` huérfano, sin fila que lo referencie', async () => {
    sessionUserId.current = CREDENTIAL_ID;
    const response = await request('document-files', 'empresa-(30-1)/employee/legajo/doc.pdf');
    expect(response.status).toBe(404);
  });

  it('404 sin sesión', async () => {
    sessionUserId.current = null;
    const response = await request('logo', `${companyId}/${KEY_SUFFIX}`);
    expect(response.status).toBe(404);
  });

  it('404 si la membresía está dada de baja', async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    await prisma.share_company_users.updateMany({ where: { profile_id: PROFILE_ID }, data: { is_active: false } });
    sessionUserId.current = CREDENTIAL_ID;
    const response = await request('logo', `${companyId}/${KEY_SUFFIX}`);
    expect(response.status).toBe(404);
    await prisma.share_company_users.updateMany({ where: { profile_id: PROFILE_ID }, data: { is_active: true } });
  });
});
