import { describe, expect, it } from 'vitest';
import { buildRenewedDocumentName, buildReplacedDocumentName, isPathWithinCompanyFolder } from './document-file-names';

const BASE = 'grupo-horizonte-(30123456789)/persona/juan-perez-(12345678)';

describe('buildReplacedDocumentName', () => {
  it('con fecha en el nombre y nueva validez → reemplaza la fecha y usa la extensión nueva', () => {
    expect(
      buildReplacedDocumentName(`${BASE}/licencia-(01-02-2025).pdf`, 'jpg', new Date('2026-05-09T15:00:00Z'))
    ).toBe(`${BASE}/licencia-(09-05-2026).jpg`);
  });

  it('sin fecha en el nombre → conserva el nombre y cambia sólo la extensión', () => {
    expect(buildReplacedDocumentName(`${BASE}/dni-(v0).pdf`, 'png', undefined)).toBe(`${BASE}/dni-(v0).png`);
  });

  it('con fecha en el nombre pero sin validez nueva → conserva la fecha', () => {
    expect(buildReplacedDocumentName(`${BASE}/licencia-(01-02-2025).pdf`, 'pdf', undefined)).toBe(
      `${BASE}/licencia-(01-02-2025).pdf`
    );
  });
});

describe('buildRenewedDocumentName', () => {
  it('versión (vN) → (vN+1)', () => {
    expect(buildRenewedDocumentName(`${BASE}/dni-(v3).pdf`, 'pdf', {})).toBe(`${BASE}/dni-(v4).pdf`);
  });

  it('fecha DD-MM-YYYY o YYYY-MM-DD → nueva validez en DD-MM-YYYY', () => {
    expect(
      buildRenewedDocumentName(`${BASE}/licencia-(01-02-2025).pdf`, 'pdf', {
        validity: new Date('2027-01-15T15:00:00Z'),
      })
    ).toBe(`${BASE}/licencia-(15-01-2027).pdf`);
    expect(
      buildRenewedDocumentName(`${BASE}/licencia-(2025-02-01).pdf`, 'pdf', {
        validity: new Date('2027-01-15T15:00:00Z'),
      })
    ).toBe(`${BASE}/licencia-(15-01-2027).pdf`);
  });

  it('período (YYYY-MM) → nuevo período, sin duplicar la extensión', () => {
    expect(buildRenewedDocumentName(`${BASE}/recibo-(2025-01).pdf`, 'pdf', { period: '2025-02' })).toBe(
      `${BASE}/recibo-(2025-02).pdf`
    );
  });

  it('sin marcador reconocido → mismo nombre con la extensión nueva', () => {
    expect(buildRenewedDocumentName(`${BASE}/otro.pdf`, 'jpg', {})).toBe(`${BASE}/otro.jpg`);
  });
});

describe('isPathWithinCompanyFolder', () => {
  it('acepta paths bajo la carpeta de la empresa y rechaza ../, absolutos y otras empresas', () => {
    const prefix = 'grupo-horizonte-(30123456789)/';
    expect(isPathWithinCompanyFolder(`${prefix}persona/x/y.pdf`, prefix)).toBe(true);
    expect(isPathWithinCompanyFolder(`otra-(1)/persona/x/y.pdf`, prefix)).toBe(false);
    expect(isPathWithinCompanyFolder(`${prefix}../otra/y.pdf`, prefix)).toBe(false);
    expect(isPathWithinCompanyFolder(`/${prefix}y.pdf`, prefix)).toBe(false);
    expect(isPathWithinCompanyFolder(prefix, prefix)).toBe(false);
  });
});
