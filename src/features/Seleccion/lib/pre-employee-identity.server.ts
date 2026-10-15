import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';

/** Mensaje único para un DNI/CUIL ya tomado: no revela nada del otro registro (puede ser de otra empresa). */
export const DUPLICATE_IDENTITY_MESSAGE = 'Ya existe un registro con ese DNI o CUIL';

type EmployeesClient = Pick<Prisma.TransactionClient, 'employees'> | Pick<typeof prisma, 'employees'>;

/**
 * Indica si ya hay un empleado con ese DNI o CUIL. Esas columnas son unique en TODA la base, así que el chequeo
 * es global a propósito; por eso devuelve solo un booleano y nunca datos del otro registro.
 *
 * Módulo server-only SIN 'use server': no es un endpoint invocable desde el cliente.
 */
export async function employeeIdentityExists(
  documentNumber: string,
  cuil: string,
  client: EmployeesClient = prisma
): Promise<boolean> {
  const found = await client.employees.findFirst({
    where: { OR: [{ document_number: documentNumber }, { cuil }] },
    select: { id: true },
  });
  return found !== null;
}
