import 'server-only';

import { addRowResources } from '../use-cases/row-resources';
import type { EmployeeInput } from '../use-cases/types';
import type { PrismaTransactionClient } from './row-query';

export type { EmployeeInput };

/**
 * Escribe todas las relaciones (empleados, equipos, equipos de clientes) de una línea NUEVA dentro de una transacción
 * existente (clonado). Vive acá y no en `mutations.server.ts` porque ese archivo es `'use server'`: todo lo que exporta
 * se publica como Server Action invocable desde el navegador.
 */
export async function createRowRelations(
  tx: PrismaTransactionClient,
  rowId: string,
  employees: EmployeeInput[],
  equipment: string[],
  otherEquipment: string[],
  customerEquipment: string[]
): Promise<void> {
  await addRowResources(tx, rowId, { employees, equipment, otherEquipment, customerEquipment });
}
