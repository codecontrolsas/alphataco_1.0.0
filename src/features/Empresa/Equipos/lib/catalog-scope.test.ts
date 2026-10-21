import { describe, expect, it } from 'vitest';
import {
  catalogAccessError,
  catalogReadScope,
  catalogWriteScope,
  resolveCatalogAccess,
} from './catalog-scope';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

describe('catalogReadScope', () => {
  it('se acota a las filas de la empresa activa (no hay globales)', () => {
    expect(catalogReadScope(COMPANY)).toEqual({ company_id: COMPANY });
  });
});

describe('catalogWriteScope', () => {
  it('se acota a la empresa activa', () => {
    expect(catalogWriteScope(COMPANY)).toEqual({ company_id: COMPANY });
  });
});

describe('resolveCatalogAccess', () => {
  it('fila propia: ok en lectura y en escritura', () => {
    expect(resolveCatalogAccess({ company_id: COMPANY }, COMPANY, 'read')).toBe('ok');
    expect(resolveCatalogAccess({ company_id: COMPANY }, COMPANY, 'write')).toBe('ok');
  });

  it('una fila sin empresa (dato inconsistente) no es visible para ninguna empresa', () => {
    expect(resolveCatalogAccess({ company_id: null }, COMPANY, 'read')).toBe('not_found');
    expect(resolveCatalogAccess({ company_id: null }, COMPANY, 'write')).toBe('not_found');
  });

  it('fila de otra empresa: no existe, en los dos modos', () => {
    expect(resolveCatalogAccess({ company_id: OTHER }, COMPANY, 'read')).toBe('not_found');
    expect(resolveCatalogAccess({ company_id: OTHER }, COMPANY, 'write')).toBe('not_found');
  });

  it('fila ausente (null/undefined): not_found', () => {
    expect(resolveCatalogAccess(null, COMPANY, 'read')).toBe('not_found');
    expect(resolveCatalogAccess(undefined, COMPANY, 'write')).toBe('not_found');
  });
});

describe('catalogAccessError', () => {
  it('no hay error cuando el acceso es ok', () => {
    expect(catalogAccessError('ok', 'Marca no encontrada')).toBeNull();
  });

  it('not_found devuelve el mensaje del catálogo, sin revelar de quién es la fila', () => {
    expect(catalogAccessError('not_found', 'Marca no encontrada')).toBe('Marca no encontrada');
  });
});
