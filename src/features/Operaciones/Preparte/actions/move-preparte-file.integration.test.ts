import { buildStorageFileUrl, parseStorageFileUrl } from '@/shared/lib/storage-url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `movePreparteFile` contra el RustFS del compose. Corre sólo con `DATABASE_URL` (el módulo
 * importa Prisma al cargarse) y `S3_ENDPOINT`:
 *
 *   set -a; source .env.docker; set +a
 *   DATABASE_URL=postgresql://alphataco:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/alphataco \
 *   S3_ENDPOINT=http://127.0.0.1:$STORAGE_PORT \
 *   npx vitest run src/features/Operaciones/Preparte/actions/move-preparte-file.integration.test.ts
 *
 * El camino que importa es el REINTENTO: mover falla porque el destino existe, se borra el
 * destino y se vuelve a mover. Depende de que `storageMove` marque ese fallo con
 * `code: 'already-exists'` y de la semántica real de S3 (que no tiene `move`: es copiar +
 * borrar), así que un mock del storage no probaría nada.
 */
const RUN = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);

const COMPANY_ID = '99999999-9999-4999-8999-99999999aaa1';
const BUCKET = 'preparte-img';

vi.mock('@/shared/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant')>()),
  getActiveCompanyId: async () => COMPANY_ID,
}));

const CLIENTE = 'Vista Oil & Gas';
const CONTRATO = 'Servicio de Izaje';
const PEDIDO = 'PED-0042';
/** El destino que arma la action con esos datos. */
const TARGET = `${COMPANY_ID}/vista-oil---gas/servicio-de-izaje/ped-0042/ped-0042.jpg`;

function upload(key: string, content: string) {
  return import('@/shared/lib/storage').then(({ storageUpload }) =>
    storageUpload(BUCKET, key, new File([new TextEncoder().encode(content)], 'foto.jpg', { type: 'image/jpeg' }), {
      upsert: true,
    })
  );
}

async function read(key: string): Promise<string | null> {
  const { storageDownload } = await import('@/shared/lib/storage');
  const result = await storageDownload(BUCKET, key);
  return result.ok ? result.data.text() : null;
}

describe.skipIf(!RUN)('movePreparteFile (integración contra RustFS)', () => {
  beforeEach(async () => {
    const { storageRemove } = await import('@/shared/lib/storage');
    await storageRemove(BUCKET, [TARGET, `${COMPANY_ID}/nueva.jpg`, `${COMPANY_ID}/otra.jpg`]);
  });

  afterAll(async () => {
    const { storageRemove } = await import('@/shared/lib/storage');
    await storageRemove(BUCKET, [TARGET, `${COMPANY_ID}/nueva.jpg`, `${COMPANY_ID}/otra.jpg`]);
  });

  it('mueve la imagen temporal a la ruta del pedido y devuelve la URL versionada', async () => {
    const { movePreparteFile } = await import('./move-preparte-file.server');
    await upload(`${COMPANY_ID}/nueva.jpg`, 'primera foto');

    const url = await movePreparteFile(
      buildStorageFileUrl(BUCKET, `${COMPANY_ID}/nueva.jpg`),
      CLIENTE,
      CONTRATO,
      PEDIDO
    );

    expect(parseStorageFileUrl(url)).toEqual({ bucket: BUCKET, path: TARGET });
    // La key es determinística y se pisa al reemplazar: sin `?v=` el navegador serviría la
    // foto vieja de su caché hasta un día.
    expect(url).toMatch(/\?v=\d+$/);
    expect(await read(TARGET)).toBe('primera foto');
    // El origen ya no está: el move es copiar + borrar.
    expect(await read(`${COMPANY_ID}/nueva.jpg`)).toBeNull();
  });

  it('reemplaza la imagen cuando el pedido ya tenía una (camino de reintento)', async () => {
    const { movePreparteFile } = await import('./move-preparte-file.server');
    await upload(`${COMPANY_ID}/nueva.jpg`, 'primera foto');
    await movePreparteFile(buildStorageFileUrl(BUCKET, `${COMPANY_ID}/nueva.jpg`), CLIENTE, CONTRATO, PEDIDO);

    // Segunda subida para el MISMO pedido y la misma extensión: el destino ya existe, así
    // que el primer move falla con `already-exists` y hay que borrar y reintentar.
    await upload(`${COMPANY_ID}/otra.jpg`, 'foto reemplazada');
    const url = await movePreparteFile(
      buildStorageFileUrl(BUCKET, `${COMPANY_ID}/otra.jpg`),
      CLIENTE,
      CONTRATO,
      PEDIDO
    );

    expect(parseStorageFileUrl(url)?.path).toBe(TARGET);
    expect(await read(TARGET)).toBe('foto reemplazada');
    expect(await read(`${COMPANY_ID}/otra.jpg`)).toBeNull();
  });

  it('la URL versionada del reemplazo es distinta de la anterior', async () => {
    const { movePreparteFile } = await import('./move-preparte-file.server');
    await upload(`${COMPANY_ID}/nueva.jpg`, 'primera foto');
    const first = await movePreparteFile(
      buildStorageFileUrl(BUCKET, `${COMPANY_ID}/nueva.jpg`),
      CLIENTE,
      CONTRATO,
      PEDIDO
    );

    await new Promise((resolve) => setTimeout(resolve, 2));
    await upload(`${COMPANY_ID}/otra.jpg`, 'foto reemplazada');
    const second = await movePreparteFile(
      buildStorageFileUrl(BUCKET, `${COMPANY_ID}/otra.jpg`),
      CLIENTE,
      CONTRATO,
      PEDIDO
    );

    expect(second).not.toBe(first);
  });

  it('mover a la misma ruta es idempotente y no pierde el archivo', async () => {
    const { movePreparteFile } = await import('./move-preparte-file.server');
    await upload(TARGET, 'ya estaba en su lugar');

    const url = await movePreparteFile(buildStorageFileUrl(BUCKET, TARGET), CLIENTE, CONTRATO, PEDIDO);

    expect(parseStorageFileUrl(url)?.path).toBe(TARGET);
    expect(await read(TARGET)).toBe('ya estaba en su lugar');
  });

  it('rechaza una imagen de otra empresa', async () => {
    const { movePreparteFile } = await import('./move-preparte-file.server');
    const ajena = buildStorageFileUrl(BUCKET, '99999999-9999-4999-8999-99999999bbb2/ajena.jpg');
    await expect(movePreparteFile(ajena, CLIENTE, CONTRATO, PEDIDO)).rejects.toThrow(/no pertenece a la empresa/i);
  });

  it('rechaza una URL que no es del bucket de preparte', async () => {
    const { movePreparteFile } = await import('./move-preparte-file.server');
    const otroBucket = buildStorageFileUrl('logo', `${COMPANY_ID}/logo/logo.png`);
    await expect(movePreparteFile(otroBucket, CLIENTE, CONTRATO, PEDIDO)).rejects.toThrow(/no es un archivo válido/i);
  });
});
