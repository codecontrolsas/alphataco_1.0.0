import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { employeeLabel } from './labels';

/** Empleados activos de la empresa por legajo, apellido o nombre, con el label `[legajo] Apellido Nombre`. */
export async function findEmployeeOptions(companyId: string, query: string, limit: number) {
  const q = query.trim();
  const where = {
    company_id: companyId,
    is_active: true,
    ...(q
      ? {
          OR: [
            { file: { contains: q, mode: 'insensitive' as const } },
            { lastname: { contains: q, mode: 'insensitive' as const } },
            { firstname: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.employees.findMany({
      where,
      select: { id: true, file: true, lastname: true, firstname: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
      take: limit,
    }),
    prisma.employees.count({ where }),
  ]);
  return { items: rows.map((e) => ({ id: e.id, label: employeeLabel(e) })), total };
}
