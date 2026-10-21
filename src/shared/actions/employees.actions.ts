'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId, NoActiveCompanyError } from '@/shared/lib/tenant';

const logger = new Logger('shared/employees');

/** Empresa activa o null (los listados legacy devolvían [] sin empresa en vez de lanzar). */
async function activeCompanyOrNull(): Promise<string | null> {
  try {
    return await getActiveCompanyId();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) return null;
    throw error;
  }
}

const employeeRelations = {
  contractor_employee: { include: { customers: true } },
  company_positions: true,
  hierarchy: true,
  cities: true,
  provinces: true,
  work_diagram: true,
  countries: true,
  cost_center: true,
} as const;
