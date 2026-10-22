import { normalizeCuit } from '@/shared/utils/cuit-text';
import { describe, expect, it } from 'vitest';
import { buildLogoPath, logoExtension, normalizePhone, parseCompanyForm } from './company-form';

function formData(entries: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) fd.append(key, value);
  }
  return fd;
}

const VALID = {
  company_name: '  Empresa Demo ',
  company_cuit: '30-71234567-1',
  description: 'Servicios petroleros',
  website: 'www.demo.com',
  contact_email: 'Contacto@Demo.com',
  contact_phone: '+54 (299) 123-4567',
  address: 'Ruta 22 km 1234',
  country: 'argentina',
  province_id: '15',
  city: '1234',
  industry: 'Petróleo',
  by_defect: 'on',
};

describe('normalizeCuit', () => {
  it('quita guiones y espacios', () => {
    expect(normalizeCuit('30-71234567-1')).toBe('30712345671');
    expect(normalizeCuit(' 30 71234567 1 ')).toBe('30712345671');
  });
  it('deja intacto un cuit ya normalizado', () => {
    expect(normalizeCuit('30712345671')).toBe('30712345671');
  });
});

describe('normalizePhone', () => {
  it('conserva el + inicial y elimina separadores', () => {
    expect(normalizePhone('+54 (299) 123-4567')).toBe('+542991234567');
  });
  it('sin + inicial devuelve sólo dígitos', () => {
    expect(normalizePhone('0299 15-123 4567')).toBe('0299151234567');
  });
  it('un + en el medio no se conserva', () => {
    expect(normalizePhone('299+1234')).toBe('2991234');
  });
});

describe('parseCompanyForm', () => {
  it('normaliza un formulario válido (trim, cuit, teléfono, email en minúsculas, ids numéricos)', () => {
    const result = parseCompanyForm(formData(VALID));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      company_name: 'Empresa Demo',
      company_cuit: '30712345671',
      description: 'Servicios petroleros',
      website: 'www.demo.com',
      contact_email: 'contacto@demo.com',
      contact_phone: '+542991234567',
      address: 'Ruta 22 km 1234',
      country: 'argentina',
      province_id: 15,
      city: 1234,
      industry: 'Petróleo',
      by_defect: true,
    });
  });

  it('website ausente queda como cadena vacía y by_defect ausente como false', () => {
    const result = parseCompanyForm(formData({ ...VALID, website: undefined, by_defect: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.website).toBe('');
    expect(result.data.by_defect).toBe(false);
  });

  it('rechaza un cuit con dígito verificador inválido, con el error en company_cuit', () => {
    const result = parseCompanyForm(formData({ ...VALID, company_cuit: '30712345674' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors)).toEqual(['company_cuit']);
  });

  it('rechaza un cuit que no tiene 11 dígitos', () => {
    const result = parseCompanyForm(formData({ ...VALID, company_cuit: '3071234567' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.company_cuit).toBeDefined();
  });

  it('exige provincia y ciudad numéricas', () => {
    const result = parseCompanyForm(formData({ ...VALID, province_id: '', city: 'abc' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.province_id).toBeDefined();
    expect(result.errors.city).toBeDefined();
  });

  it('rechaza email inválido y website inválido', () => {
    const result = parseCompanyForm(formData({ ...VALID, contact_email: 'no-es-mail', website: 'esto no es url' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.contact_email).toBeDefined();
    expect(result.errors.website).toBeDefined();
  });

  it('acumula un error por campo (el primero de cada uno)', () => {
    const result = parseCompanyForm(formData({}));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.company_name).toBeDefined();
    expect(result.errors.company_cuit).toBeDefined();
    expect(result.errors.description).toBeDefined();
    expect(typeof result.errors.company_name).toBe('string');
  });
});

describe('logoExtension / buildLogoPath', () => {
  it('devuelve la extensión en minúsculas', () => {
    expect(logoExtension('Logo.PNG')).toBe('png');
    expect(logoExtension('a.b.jpeg')).toBe('jpeg');
  });
  it('rechaza archivos sin extensión o con extensión no permitida', () => {
    expect(logoExtension('logo')).toBeNull();
    expect(logoExtension('logo.exe')).toBeNull();
    expect(logoExtension('.png')).toBeNull();
  });
  it('arma el path bajo la carpeta de la empresa', () => {
    expect(buildLogoPath('c0ffee00-0000-4000-8000-000000000001', 'Logo.PNG')).toBe(
      'c0ffee00-0000-4000-8000-000000000001/logo/logo.png'
    );
  });
  it('lanza si el archivo no tiene extensión válida', () => {
    expect(() => buildLogoPath('c0ffee00-0000-4000-8000-000000000001', 'logo.exe')).toThrow();
  });
});
