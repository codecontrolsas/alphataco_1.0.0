import { describe, expect, it } from 'vitest';
import {
  documentTypeReadScope,
  documentTypeWriteScope,
  resolveDocumentTypeAccess,
} from './document-type-policy';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('scopes de document_types', () => {
  it('lectura y escritura: sólo los tipos de la empresa (no hay globales)', () => {
    expect(documentTypeReadScope(COMPANY)).toEqual({ company_id: COMPANY });
    expect(documentTypeWriteScope(COMPANY)).toEqual({ company_id: COMPANY });
  });
});

describe('resolveDocumentTypeAccess', () => {
  it('inexistente o de otra empresa → not_found (no se revela que existe)', () => {
    expect(resolveDocumentTypeAccess(null, COMPANY, 'read')).toBe('not_found');
    expect(resolveDocumentTypeAccess({ company_id: OTHER }, COMPANY, 'read')).toBe('not_found');
    expect(resolveDocumentTypeAccess({ company_id: OTHER }, COMPANY, 'write')).toBe('not_found');
  });

  it('propio → ok para leer y escribir', () => {
    expect(resolveDocumentTypeAccess({ company_id: COMPANY }, COMPANY, 'read')).toBe('ok');
    expect(resolveDocumentTypeAccess({ company_id: COMPANY }, COMPANY, 'write')).toBe('ok');
  });

  it('una fila sin empresa (dato inconsistente) no es visible para ninguna empresa', () => {
    expect(resolveDocumentTypeAccess({ company_id: null }, COMPANY, 'read')).toBe('not_found');
    expect(resolveDocumentTypeAccess({ company_id: null }, COMPANY, 'write')).toBe('not_found');
  });
});
