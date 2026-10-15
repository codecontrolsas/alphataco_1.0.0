import type { ComplianceDoc, ComplianceResource, ComplianceType } from './types';

export const COMPANY = 'c0000000-0000-4000-8000-000000000001';
export const OTHER_COMPANY = 'c0000000-0000-4000-8000-000000000002';

export function makeType(overrides: Partial<ComplianceType> = {}): ComplianceType {
  return {
    id: 't1',
    companyId: null,
    applies: 'Persona',
    mandatory: true,
    isActive: true,
    monthly: false,
    hasExpiry: false,
    downDocument: false,
    isPrivate: false,
    multiresource: false,
    scope: { special: false, conditions: [] },
    ...overrides,
  };
}

export function makeResource(overrides: Partial<ComplianceResource> = {}): ComplianceResource {
  return {
    id: 'r1',
    companyId: COMPANY,
    applies: 'Persona',
    isActive: true,
    direct: {},
    relations: {},
    ...overrides,
  };
}

let seq = 0;
export function makeDoc(overrides: Partial<ComplianceDoc> = {}): ComplianceDoc {
  seq += 1;
  return {
    id: `d${seq}`,
    typeId: 't1',
    storedState: 'presentado',
    validityDay: null,
    period: null,
    path: `files/${seq}.pdf`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, seq)),
    ...overrides,
  };
}
