'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId, NoActiveCompanyError } from '@/shared/lib/tenant';

const logger = new Logger('shared/equipment');

export const fetchSimpleDataEquipment = async () => {
  let company_id: string;
  try {
    company_id = await getActiveCompanyId();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) return [];
    throw error;
  }

  try {
    return await prisma.vehicles.findMany({
      where: withCompany({}, company_id),
      select: { domain: true, serie: true, intern_number: true, id: true },
    });
  } catch (error) {
    logger.error('Error fetching simple equipment', { data: { error, company_id } });
    return [];
  }
};
