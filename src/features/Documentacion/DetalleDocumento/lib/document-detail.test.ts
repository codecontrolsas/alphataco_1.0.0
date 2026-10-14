import { describe, expect, it } from 'vitest';
import {
  denyReasonBadgeVariant,
  documentStateBadgeVariant,
  employeeAddress,
  employeeDisplayName,
  equipmentDisplayName,
  expiryLabel,
  formatCuit,
  isPdfUrl,
  resolveResourceKind,
  resourceLabel,
  shortDate,
  uploadedAtLabel,
} from './document-detail';

describe('resolveResourceKind', () => {
  it('traduce las etiquetas del ?resource= de la navegación', () => {
    expect(resolveResourceKind('Persona')).toBe('employee');
    expect(resolveResourceKind('Equipos')).toBe('vehicle');
    expect(resolveResourceKind('Empresa')).toBe('company');
  });

  it('devuelve null sin parámetro o con uno desconocido', () => {
    expect(resolveResourceKind(undefined)).toBeNull();
    expect(resolveResourceKind(null)).toBeNull();
    expect(resolveResourceKind('')).toBeNull();
    expect(resolveResourceKind('persona')).toBeNull();
    expect(resolveResourceKind('Otro')).toBeNull();
  });
});

describe('resourceLabel', () => {
  it('nombra cada recurso', () => {
    expect(resourceLabel('employee')).toBe('Empleado');
    expect(resourceLabel('vehicle')).toBe('Equipo');
    expect(resourceLabel('company')).toBe('Empresa');
  });
});

describe('formatCuit', () => {
  it('separa el CUIT con guiones', () => {
    expect(formatCuit('30712345673')).toBe('30-71234567-3');
  });

  it('devuelve cadena vacía para nulo, indefinido o vacío', () => {
    expect(formatCuit(null)).toBe('');
    expect(formatCuit(undefined)).toBe('');
    expect(formatCuit('')).toBe('');
  });

  it('deja intacto lo que no tiene 11 dígitos', () => {
    expect(formatCuit('123')).toBe('123');
  });
});

describe('documentStateBadgeVariant', () => {
  it('mapea cada estado a su variante', () => {
    expect(documentStateBadgeVariant('rechazado')).toBe('destructive');
    expect(documentStateBadgeVariant('aprobado')).toBe('success');
    expect(documentStateBadgeVariant('vencido')).toBe('yellow');
    expect(documentStateBadgeVariant('presentado')).toBe('default');
    expect(documentStateBadgeVariant(null)).toBe('default');
  });
});

describe('denyReasonBadgeVariant', () => {
  it('pinta como error tanto rechazado como vencido', () => {
    expect(denyReasonBadgeVariant('rechazado')).toBe('destructive');
    expect(denyReasonBadgeVariant('vencido')).toBe('destructive');
  });

  it('mantiene el resto de los estados', () => {
    expect(denyReasonBadgeVariant('aprobado')).toBe('success');
    expect(denyReasonBadgeVariant('pendiente')).toBe('default');
    expect(denyReasonBadgeVariant(undefined)).toBe('default');
  });
});

describe('isPdfUrl', () => {
  it('detecta PDFs sin importar mayúsculas', () => {
    expect(isPdfUrl('https://host/bucket/archivo.pdf')).toBe(true);
    expect(isPdfUrl('https://host/bucket/archivo.PDF')).toBe(true);
  });

  it('ignora el `?v=` de las URLs versionadas', () => {
    // Las keys que se pisan en su lugar (logo de empresa, imagen del preparte) guardan la
    // URL con un parámetro de versión para romper la caché del navegador.
    expect(isPdfUrl('/api/files/document-files/a/archivo.pdf?v=1758585600000')).toBe(true);
    expect(isPdfUrl('/api/files/logo/a/imagen.png?v=1')).toBe(false);
  });

  it('descarta otras extensiones', () => {
    expect(isPdfUrl('https://host/bucket/archivo.png')).toBe(false);
    expect(isPdfUrl('')).toBe(false);
  });
});

describe('expiryLabel', () => {
  it('muestra la fecha cuando el tipo de documento vence', () => {
    expect(expiryLabel(true, new Date('2026-05-09T15:00:00Z'))).toBe('Vence el 09/05/2026');
  });

  it('avisa que no vence cuando el tipo no expira', () => {
    expect(expiryLabel(false, new Date('2026-05-09T15:00:00Z'))).toBe('No tiene vencimiento');
    expect(expiryLabel(null, null)).toBe('No tiene vencimiento');
  });
});

describe('uploadedAtLabel', () => {
  it('arma la leyenda de subida con fecha y hora', () => {
    expect(uploadedAtLabel(new Date('2026-01-03T17:05:00Z'))).toBe('Subido el 03/01/2026 a las 14:05');
  });

  it('devuelve cadena vacía sin fecha', () => {
    expect(uploadedAtLabel(null)).toBe('');
    expect(uploadedAtLabel(undefined)).toBe('');
  });
});

describe('shortDate', () => {
  it('formatea en DD/MM/YYYY', () => {
    expect(shortDate(new Date('2026-12-31T15:00:00Z'))).toBe('31/12/2026');
  });

  it('devuelve cadena vacía sin fecha', () => {
    expect(shortDate(null)).toBe('');
  });
});

describe('employeeDisplayName', () => {
  it('muestra apellido y nombre', () => {
    expect(employeeDisplayName({ lastname: 'Perez', firstname: 'Ana' })).toBe('Perez Ana');
  });

  it('no deja espacios sobrantes si falta una parte', () => {
    expect(employeeDisplayName({ lastname: 'Perez', firstname: null })).toBe('Perez');
    expect(employeeDisplayName({ lastname: null, firstname: null })).toBe('');
  });
});

describe('equipmentDisplayName', () => {
  it('prefiere el dominio', () => {
    expect(equipmentDisplayName({ domain: 'AA123BB', intern_number: '77' })).toBe('AA123BB');
  });

  it('cae al número interno si no hay dominio', () => {
    expect(equipmentDisplayName({ domain: null, intern_number: '77' })).toBe('77');
    expect(equipmentDisplayName({ domain: '', intern_number: '77' })).toBe('77');
  });

  it('devuelve cadena vacía si no hay ninguno', () => {
    expect(equipmentDisplayName({ domain: null, intern_number: null })).toBe('');
  });
});

describe('employeeAddress', () => {
  it('arma calle, número y ciudad', () => {
    expect(employeeAddress({ street: 'San Martín', street_number: '450', city: { name: 'Neuquén' } })).toBe(
      'San Martín 450, Neuquén'
    );
  });

  it('omite las partes que faltan en vez de imprimir undefined', () => {
    expect(employeeAddress({ street: 'San Martín', street_number: null, city: null })).toBe('San Martín');
    expect(employeeAddress({ street: null, street_number: null, city: { name: 'Neuquén' } })).toBe('Neuquén');
    expect(employeeAddress({ street: null, street_number: null, city: null })).toBe('');
  });
});
