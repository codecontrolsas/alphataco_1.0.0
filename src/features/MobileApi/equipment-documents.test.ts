import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allowedResources, resolveDocumentAccess } from './documents/access';
import { buildDocumentFileUrl, documentFileName, verifyDocumentFileSignature } from './documents/file-url';
import {
  documentStatus,
  filterRows,
  matchesSearch,
  pageRows,
  searchVariants,
  type MobileDocumentRow,
} from './documents/rows';
import { resolveEquipmentAccess } from './equipment/access';
import { InvalidCursorError } from './lib/labels';

/**
 * API móvil de Equipos y Documentación, partes puras: permisos web → lo que ve la app, estado de un documento,
 * búsqueda y paginación en memoria, y el enlace firmado del archivo.
 */
const perms = (granted: string[], visible: string[] = granted) => ({
  has: (key: string) => granted.includes(key),
  isTabVisible: (key: string) => visible.includes(key),
});

describe('resolveEquipmentAccess: lo mismo que la web', () => {
  it('sin permisos, nada', () => {
    const none = resolveEquipmentAccess(perms([]));
    for (const kind of [none.vehicle, none.other]) {
      expect(kind).toMatchObject({ listActive: false, listInactive: false, record: false, technical: false });
    }
    expect(none.vehicle.documents.visible).toBe(false);
  });

  it('cada listado exige su subpestaña; las bajas, `inactive`', () => {
    const a = resolveEquipmentAccess(perms(['equipos:vehicles:view', 'equipos:inactive:view']));
    expect(a.vehicle).toMatchObject({ listActive: true, listInactive: true });
    expect(a.other).toMatchObject({ listActive: false, listInactive: true });
  });

  it('los bloques de la ficha exigen ver la ficha; documentos con la pestaña de documentación y su subpestaña', () => {
    expect(resolveEquipmentAccess(perms(['equipos:datos-basicos:view'], [])).vehicle.technical).toBe(false);
    const full = resolveEquipmentAccess(
      perms([
        'equipos:detalle-equipo:view',
        'equipos:datos-basicos:view',
        'documentacion:documentos-de-equipos:view',
        'documentacion:docs-equipos-permanentes:view',
      ])
    );
    expect(full.vehicle).toMatchObject({ record: true, technical: true, assignment: false });
    expect(full.vehicle.documents).toEqual({ visible: true, permanent: true, monthly: false, privateTypes: false });
    // Sin la pestaña de documentos de equipos visible, la subpestaña sola no alcanza (como `VehicleReadView`).
    expect(
      resolveEquipmentAccess(
        perms(
          ['equipos:detalle-equipo:view', 'documentacion:docs-equipos-permanentes:view'],
          ['equipos:detalle-equipo:view']
        )
      ).vehicle.documents.visible
    ).toBe(false);
  });

  it('equipamiento: sus documentos son las certificaciones de la ficha', () => {
    const a = resolveEquipmentAccess(perms(['equipos:detalle-otro-equipo:view', 'equipos:certificaciones-otro:view']));
    expect(a.other).toMatchObject({ record: true, certifications: true });
    expect(resolveEquipmentAccess(perms(['equipos:certificaciones-otro:view'])).other.certifications).toBe(false);
  });
});

describe('resolveDocumentAccess y módulos', () => {
  const all = [
    'documentacion:documentos-de-empleados:view',
    'documentacion:docs-empleados-permanentes:view',
    'documentacion:documentos-de-equipos:view',
    'documentacion:docs-equipos-mensuales:view',
    'documentacion:documentos-de-empresa:view',
    'documentacion:docs-empresa-permanentes:view',
  ];

  it('cada clase: pestaña visible + view del período; privados aparte', () => {
    const access = resolveDocumentAccess(perms([...all, 'documentacion:documentos-de-equipos:view_private']));
    expect(access.employee).toEqual({ permanent: true, monthly: false, privateTypes: false });
    expect(access.equipment).toEqual({ permanent: false, monthly: true, privateTypes: true });
    expect(access.detail).toBe(false);
  });

  it('documentos de empleados exigen `empleados` encendido y los de equipos, `equipos`', () => {
    const access = resolveDocumentAccess(perms(all));
    expect(allowedResources(access, new Set(['empleados', 'equipos']))).toEqual(['employee', 'equipment', 'company']);
    expect(allowedResources(access, new Set(['equipos']))).toEqual(['equipment', 'company']);
    expect(allowedResources(access, new Set())).toEqual(['company']);
  });
});

describe('estado de un documento en la app', () => {
  it('traduce el estado de la web', () => {
    expect(documentStatus('pendiente', false)).toBe('missing');
    expect(documentStatus('rechazado', false)).toBe('rejected');
    expect(documentStatus('vencido', false)).toBe('expired');
    expect(documentStatus('aprobado', true)).toBe('expiring');
    expect(documentStatus('presentado', true)).toBe('expiring');
    expect(documentStatus('aprobado', false)).toBe('valid');
    expect(documentStatus('presentado', false)).toBe('valid');
  });
});

function row(n: number, overrides: Partial<MobileDocumentRow> = {}): MobileDocumentRow {
  const name = `Perez ${n}`;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    isMissing: false,
    resource: { kind: 'employee', id: 'e', name, fileNumber: String(1000 + n), domain: null, internNumber: null },
    type: { id: 't', name: 'Licencia', mandatory: true, monthly: false, hasExpiry: true, private: false },
    state: 'aprobado',
    status: 'valid',
    validity: '2026-12-01',
    period: null,
    search: searchVariants(name, String(1000 + n), 'Licencia'),
    ...overrides,
  };
}

describe('búsqueda y paginación en memoria', () => {
  it('busca por cada palabra, sin tildes ni mayúsculas, y una patente sin espacios ni guiones', () => {
    const vehicle = row(1, { search: searchVariants('AB 123 CD', 'Póliza') });
    expect(matchesSearch(vehicle, 'ab123cd')).toBe(true);
    expect(matchesSearch(vehicle, 'AB-123-CD')).toBe(true);
    expect(matchesSearch(vehicle, 'poliza ab')).toBe(true);
    expect(matchesSearch(vehicle, 'licencia')).toBe(false);
  });

  it('filtra por estado y tipo', () => {
    const rows = [row(1), row(2, { status: 'missing', state: 'pendiente', isMissing: true }), row(3, { type: { ...row(3).type, id: 'x' } })];
    expect(filterRows(rows, { status: 'missing' }).map((r) => r.id)).toEqual([rows[1]!.id]);
    expect(filterRows(rows, { typeId: 'x' }).map((r) => r.id)).toEqual([rows[2]!.id]);
  });

  it('lo que pide acción primero; recorre todas las páginas sin duplicados ni saltos, con empates', () => {
    const rows = [
      row(1),
      row(2, { status: 'expired', state: 'vencido' }),
      row(3),
      row(4, { status: 'missing', state: 'pendiente', isMissing: true, validity: null }),
      row(5, { status: 'expiring', validity: '2026-11-10' }),
      row(6),
      row(7, { validity: null }),
    ];
    const all = pageRows(rows, { limit: 50 });
    expect(all.nextCursor).toBeNull();
    expect(all.total).toBe(7);
    expect(all.page.slice(0, 3).map((r) => r.status)).toEqual(['missing', 'expired', 'expiring']);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = pageRows(rows, { limit: 2, cursor });
      if (pages > 0) expect(page.total).toBeNull();
      seen.push(...page.page.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(4);
    expect(seen).toEqual(all.page.map((r) => r.id));
  });

  it('cursor ilegible: error de cursor', () => {
    expect(() => pageRows([row(1)], { limit: 2, cursor: 'no-es-un-cursor' })).toThrow(InvalidCursorError);
  });
});

describe('enlace firmado del archivo', () => {
  const COMPANY = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';
  const DOC = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'secreto-de-prueba');
    vi.useFakeTimers({ now: new Date('2026-11-03T12:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const parse = (url: string) => {
    const params = new URL(`http://x${url}`).searchParams;
    return { companyId: params.get('c')!, expires: Number(params.get('exp')), sig: params.get('sig')! };
  };

  it('vale para esa empresa, esa clase y ese documento hasta que vence (5 minutos); no lleva el path', () => {
    const link = buildDocumentFileUrl(COMPANY, 'employee', DOC);
    expect(link.url.startsWith(`/api/mobile/v1/documents/employee/${DOC}/file/content?`)).toBe(true);
    expect(link.url).not.toContain('document-files');
    expect(link.expiresAt).toBe('2026-11-03T12:05:00.000Z');
    const signed = parse(link.url);
    expect(verifyDocumentFileSignature({ ...signed, resource: 'employee', documentId: DOC })).toBe(true);
    expect(verifyDocumentFileSignature({ ...signed, companyId: OTHER, resource: 'employee', documentId: DOC })).toBe(false);
    expect(verifyDocumentFileSignature({ ...signed, resource: 'equipment', documentId: DOC })).toBe(false);
    expect(verifyDocumentFileSignature({ ...signed, resource: 'employee', documentId: OTHER })).toBe(false);
    vi.setSystemTime(new Date('2026-11-03T12:05:01Z'));
    expect(verifyDocumentFileSignature({ ...signed, resource: 'employee', documentId: DOC })).toBe(false);
  });

  it('nombre de descarga: tipo de documento + extensión guardada', () => {
    expect(documentFileName('Licencia de conducir', 'abc/123/lic.PDF')).toBe('Licencia de conducir.pdf');
    expect(documentFileName('A/B: "x"', 'sin-extension')).toBe('A B x');
  });
});
