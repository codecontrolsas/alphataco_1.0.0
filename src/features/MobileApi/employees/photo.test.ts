import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveEmployeeAccess } from './access';
import { buildPhotoUrls, decodePictureDataUrl, photoEtag, pictureVersion, verifyPhotoSignature } from './photo';

/**
 * API móvil de Empleados (808), partes puras: la URL prefirmada de la foto (HMAC sobre empresa + empleado + variante +
 * vencimiento) y la traducción de permisos web → lo que la app puede ver.
 */
const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';

function signed(url: string) {
  const params = new URL(`http://x${url}`).searchParams;
  return {
    companyId: params.get('c')!,
    variant: params.get('variant') as 'thumb' | 'full',
    expires: Number(params.get('exp')),
    sig: params.get('sig')!,
  };
}

describe('foto prefirmada', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'secreto-de-prueba');
    vi.useFakeTimers({ now: new Date('2026-10-28T12:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('sin foto no hay URLs', () => {
    expect(buildPhotoUrls(COMPANY, EMPLOYEE, null)).toBeNull();
  });

  it('la firma vale para esa empresa, ese empleado y esa variante, hasta que vence (15 minutos)', () => {
    const urls = buildPhotoUrls(COMPANY, EMPLOYEE, 'v1')!;
    expect(urls.expiresAt).toBe('2026-10-28T12:15:00.000Z');
    const full = signed(urls.url);
    expect(verifyPhotoSignature({ ...full, employeeId: EMPLOYEE })).toBe(true);
    expect(verifyPhotoSignature({ ...signed(urls.thumbUrl), employeeId: EMPLOYEE })).toBe(true);

    expect(verifyPhotoSignature({ ...full, companyId: OTHER, employeeId: EMPLOYEE })).toBe(false);
    expect(verifyPhotoSignature({ ...full, employeeId: OTHER })).toBe(false);
    expect(verifyPhotoSignature({ ...full, variant: 'thumb', employeeId: EMPLOYEE })).toBe(false);
    expect(verifyPhotoSignature({ ...full, expires: full.expires + 60, employeeId: EMPLOYEE })).toBe(false);
    expect(verifyPhotoSignature({ ...full, sig: `${full.sig}x`, employeeId: EMPLOYEE })).toBe(false);

    vi.setSystemTime(new Date('2026-10-28T12:15:01Z'));
    expect(verifyPhotoSignature({ ...full, employeeId: EMPLOYEE })).toBe(false);
  });

  it('otro secreto, otra firma', () => {
    const full = signed(buildPhotoUrls(COMPANY, EMPLOYEE, 'v1')!.url);
    vi.stubEnv('BETTER_AUTH_SECRET', 'otro-secreto');
    expect(verifyPhotoSignature({ ...full, employeeId: EMPLOYEE })).toBe(false);
  });

  it('solo se sirven imágenes guardadas como data URL; la versión y el ETag dependen del contenido', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(decodePictureDataUrl(png)).toMatchObject({ contentType: 'image/png' });
    expect(decodePictureDataUrl('data:image/jpg;base64,AAAA')).toMatchObject({ contentType: 'image/jpeg' });
    expect(decodePictureDataUrl('data:text/html;base64,PGh0bWw+')).toBeNull();
    expect(decodePictureDataUrl('https://otro.sitio/foto.png')).toBeNull();
    expect(decodePictureDataUrl(null)).toBeNull();
    expect(pictureVersion(png)).toBe(pictureVersion(png));
    expect(pictureVersion(png)).not.toBe(pictureVersion(`${png}A`));
    expect(photoEtag('abc', 'thumb')).toBe('"abc-thumb"');
  });
});

describe('resolveEmployeeAccess: lo mismo que la web', () => {
  const access = (granted: string[], visible: string[] = granted) =>
    resolveEmployeeAccess({
      has: (key) => granted.includes(key),
      isTabVisible: (key) => visible.includes(key),
    });

  it('sin permisos, nada', () => {
    const none = access([]);
    expect(none).toMatchObject({
      listActive: false,
      listInactive: false,
      record: false,
      personal: false,
      contact: false,
    });
    expect(none.documents.visible).toBe(false);
  });

  it('contacto solo junto con datos personales; los bloques exigen ver el legajo', () => {
    expect(access(['empleados:employees:view', 'empleados:datos-contacto:view']).contact).toBe(false);
    expect(
      access(['empleados:employees:view', 'empleados:datos-personales:view', 'empleados:datos-contacto:view']).contact
    ).toBe(true);
    expect(access(['empleados:datos-personales:view', 'empleados:datos-laborales:view'])).toMatchObject({
      record: false,
      personal: false,
      work: false,
    });
  });

  it('documentación: pestaña visible y el view de permanentes o mensuales; privados aparte', () => {
    const base = ['empleados:employees:view', 'documentacion:documentos-de-empleados:view'];
    expect(access([...base, 'documentacion:docs-empleados-mensuales:view']).documents).toEqual({
      visible: true,
      permanent: false,
      monthly: true,
      privateTypes: false,
    });
    expect(
      access(['empleados:employees:view', 'documentacion:docs-empleados-permanentes:view']).documents.visible
    ).toBe(false);
  });
});
