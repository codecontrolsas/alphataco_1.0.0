import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_UPLOAD_BUCKETS,
  COMPANY_PREFIXED_BUCKETS,
  STORAGE_BUCKETS,
  companyIdFromKey,
  isClientUploadBucket,
  isCompanyPrefixedBucket,
  isStorageBucket,
} from './storage-buckets';

const COMPANY = '11111111-2222-3333-4444-555555555555';

describe('STORAGE_BUCKETS', () => {
  it('es la única lista: el compose no la duplica y los buckets los crea `scripts/ensure-buckets.ts`', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');
    expect(compose).not.toMatch(/\bmc mb\b/);
    for (const bucket of STORAGE_BUCKETS) expect(compose).not.toContain(bucket);

    expect(readFileSync('docker/entrypoint.sh', 'utf8')).toContain('scripts/ensure-buckets.ts');
    expect(readFileSync('scripts/dev-up.sh', 'utf8')).toContain('scripts/ensure-buckets.ts');
  });

  it('ensure-buckets no toca políticas ni ACL: los buckets quedan privados', () => {
    const script = readFileSync('scripts/ensure-buckets.ts', 'utf8');
    expect(script).not.toMatch(/PutBucketPolicy|PutBucketAcl|public-read/);
  });
});

describe('isStorageBucket', () => {
  it('sólo acepta los buckets conocidos', () => {
    expect(isStorageBucket('document-files')).toBe(true);
    expect(isStorageBucket('preparte-img')).toBe(true);
    // Sobraba en el compose y no lo usa nadie desde que se borró `/api/upload`.
    expect(isStorageBucket('employee-documents')).toBe(false);
    expect(isStorageBucket('../etc')).toBe(false);
    expect(isStorageBucket(undefined)).toBe(false);
  });
});

describe('COMPANY_PREFIXED_BUCKETS', () => {
  it('son todos buckets conocidos', () => {
    for (const bucket of COMPANY_PREFIXED_BUCKETS) expect(isStorageBucket(bucket)).toBe(true);
  });

  it('los buckets de documentos NO son de prefijo: su dueño se resuelve en la base', () => {
    expect(isCompanyPrefixedBucket('document-files')).toBe(false);
    expect(isCompanyPrefixedBucket('daily-reports')).toBe(false);
    expect(isCompanyPrefixedBucket('contract-documents')).toBe(false);
  });
});

describe('CLIENT_UPLOAD_BUCKETS', () => {
  it('sólo avatar y preparte-img se suben desde el navegador', () => {
    expect([...CLIENT_UPLOAD_BUCKETS].sort()).toEqual(['avatar', 'preparte-img']);
  });

  it('los buckets de documentos no aceptan subidas del cliente', () => {
    expect(isClientUploadBucket('document-files')).toBe(false);
    expect(isClientUploadBucket('logo')).toBe(false);
    expect(isClientUploadBucket('contract-documents')).toBe(false);
  });

  it('preparte-img lleva prefijo de empresa; avatar cuelga del perfil', () => {
    expect(isCompanyPrefixedBucket('preparte-img')).toBe(true);
    // El avatar es de la persona: colgarlo de la empresa le daba un avatar por empresa a
    // quien pertenece a varias, y 404 a los compañeros de la otra.
    expect(isCompanyPrefixedBucket('avatar')).toBe(false);
  });
});

describe('companyIdFromKey', () => {
  it('devuelve el uuid del primer segmento', () => {
    expect(companyIdFromKey(`${COMPANY}/logo/logo.png`)).toBe(COMPANY);
    expect(companyIdFromKey(`${COMPANY}`)).toBe(COMPANY);
  });

  it('null si el primer segmento no es un uuid', () => {
    expect(companyIdFromKey('other-equipment-pictures/1/a.jpg')).toBeNull();
    expect(companyIdFromKey('a.jpg')).toBeNull();
    expect(companyIdFromKey('')).toBeNull();
  });
});
