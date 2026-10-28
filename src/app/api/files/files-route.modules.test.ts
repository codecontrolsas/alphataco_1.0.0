import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/files` no sirve el archivo si el módulo dueño del bucket está apagado para la empresa DUEÑA del archivo (F3.3).
 * Se prueba con el resolvedor de dueño y el storage sustituidos: acá solo importa el orden de las compuertas.
 */
const resolveOwner = vi.fn();
const isModuleEnabledForCompany = vi.fn();
const send = vi.fn();

vi.mock('@/features/Modules/server/modules.server', () => ({ isModuleEnabledForCompany }));
vi.mock('@/shared/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/shared/lib/s3', () => ({ s3Client: () => ({ send }) }));
vi.mock('@/shared/lib/session', () => ({ getSessionUserId: async () => 'user-1' }));
vi.mock('@/shared/lib/storage-perimeter', () => ({ resolveStorageObjectOwner: resolveOwner }));
vi.mock('@/shared/lib/tenant', () => ({
  canUseAsActiveCompany: async () => true,
  getActiveCompanyId: async () => 'company-a',
}));
vi.mock('@/shared/lib/tenant-db', () => ({ getTenantContextOrNull: async () => ({ kind: 'user' }) }));

async function get(bucket: string, key: string) {
  const { GET } = await import('./[bucket]/[...path]/route');
  return GET(new Request(`http://localhost/api/files/${bucket}/${key}`), {
    params: Promise.resolve({ bucket, path: key.split('/') }),
  });
}

describe('GET /api/files con módulos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOwner.mockResolvedValue({ kind: 'company', companyId: 'company-a' });
    send.mockResolvedValue({
      Body: { transformToWebStream: () => new ReadableStream() },
      ContentType: 'application/pdf',
    });
  });

  it('bucket de un módulo apagado en la empresa dueña: 404 y no toca el storage', async () => {
    isModuleEnabledForCompany.mockResolvedValue(false);

    const response = await get('invoice-pdfs', 'company-a/f1.pdf');

    expect(response.status).toBe(404);
    expect(isModuleEnabledForCompany).toHaveBeenCalledWith('facturacion', 'company-a');
    expect(send).not.toHaveBeenCalled();
  });

  it('con el módulo encendido sirve el archivo', async () => {
    isModuleEnabledForCompany.mockResolvedValue(true);

    expect((await get('invoice-pdfs', 'company-a/f1.pdf')).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('un bucket del núcleo no consulta el estado de los módulos', async () => {
    resolveOwner.mockResolvedValue({ kind: 'company', companyId: 'company-a' });

    expect((await get('logo', 'company-a/logo.png')).status).toBe(200);
    expect(isModuleEnabledForCompany).not.toHaveBeenCalled();
  });
});
