import { describe, expect, it } from 'vitest';
import { cleanFileName, hseMaterialPath, hseVersionPath, validatePdfUpload } from './pdf-file';
import { effectiveAssignmentStatus, formatPercent, toPercent } from './training-status';

/** Funciones puras de HSE que usan el dashboard y el portal (estado efectivo, porcentajes y archivos PDF). */

describe('effectiveAssignmentStatus', () => {
  const today = '2026-10-28';

  it('una aprobada vence recién el día DESPUÉS de su vigencia', () => {
    expect(effectiveAssignmentStatus('passed', '2026-10-29', today)).toBe('passed');
    expect(effectiveAssignmentStatus('passed', today, today)).toBe('passed');
    expect(effectiveAssignmentStatus('passed', '2026-10-27', today)).toBe('expired');
  });

  it('sin vigencia (no vence) sigue aprobada', () => {
    expect(effectiveAssignmentStatus('passed', null, today)).toBe('passed');
  });

  it.each(['pending', 'in_progress', 'failed'] as const)('%s no cambia aunque tenga una vigencia pasada', (status) => {
    expect(effectiveAssignmentStatus(status, '2020-01-01', today)).toBe(status);
  });
});

describe('porcentajes', () => {
  it('toPercent acepta el Decimal de Prisma, un número o nada', () => {
    expect(toPercent({ toNumber: () => 69.99 })).toBe(69.99);
    expect(toPercent(70)).toBe(70);
    expect(toPercent(null)).toBeNull();
    expect(toPercent(undefined)).toBeNull();
  });

  it('formatPercent usa la coma decimal sin ceros de más', () => {
    expect(formatPercent(68.5)).toBe('68,5 %');
    expect(formatPercent(70)).toBe('70 %');
    expect(formatPercent(69.99)).toBe('69,99 %');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('PDF de HSE', () => {
  const pdf = (bytes: string, name = 'norma.pdf', type = 'application/pdf') => new File([bytes], name, { type });

  it('acepta un PDF por su firma (no por el tipo que manda el navegador) y calcula su huella', async () => {
    const result = await validatePdfUpload(pdf('%PDF-1.7 contenido', 'norma.pdf', 'text/plain'));
    expect(result).toMatchObject({ ok: true, size: 18 });
    if (!result.ok) throw new Error('debía aceptarse');
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.file.type).toBe('application/pdf');
    // Misma entrada, misma huella; un byte distinto, otra.
    const again = await validatePdfUpload(pdf('%PDF-1.7 contenido'));
    const other = await validatePdfUpload(pdf('%PDF-1.7 contenidO'));
    expect(again.ok && again.sha256).toBe(result.sha256);
    expect(other.ok && other.sha256).not.toBe(result.sha256);
  });

  it('rechaza lo que no es PDF, el archivo vacío y la falta de archivo', async () => {
    await expect(validatePdfUpload(pdf('<html>no</html>', 'norma.pdf'))).resolves.toEqual({
      ok: false,
      error: 'El archivo no es un PDF',
    });
    await expect(validatePdfUpload(pdf(''))).resolves.toMatchObject({ ok: false });
    await expect(validatePdfUpload(null)).resolves.toMatchObject({ ok: false });
    await expect(validatePdfUpload('texto')).resolves.toMatchObject({ ok: false });
  });

  it('las rutas las arma el servidor con la empresa adelante', () => {
    expect(hseVersionPath('c', 'd', 'v')).toBe('c/documents/d/v.pdf');
    expect(hseMaterialPath('c', 't', 'm')).toBe('c/trainings/t/m.pdf');
  });

  it('el nombre visible no lleva rutas y termina en .pdf', () => {
    expect(cleanFileName('C:\\carpeta\\Norma.PDF')).toBe('Norma.PDF');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd.pdf');
    expect(cleanFileName('  ')).toBe('documento.pdf');
    expect(cleanFileName(`${'a'.repeat(200)}.pdf`)).toHaveLength(120);
  });
});
