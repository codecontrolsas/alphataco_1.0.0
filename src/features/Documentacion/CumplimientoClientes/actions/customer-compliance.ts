'use server';

import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import {
  buildWindow,
  getVisibleFitKinds,
  loadRowResourceWarnings,
  MAX_WINDOW_DAYS,
  runAssignmentPlanner,
} from '../lib/customer-compliance.server';

const logger = new Logger('features/Documentacion/CumplimientoClientes/actions');

const plannerSchema = z.object({
  customerId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  employeeIds: z.array(z.string().uuid()).max(200),
  equipmentIds: z.array(z.string().uuid()).max(200),
});

export type PlannerRequest = z.infer<typeof plannerSchema>;

/**
 * Simula asignar personas y equipos a un cliente en un período: quién cumple la documentación todo el período, qué
 * vence en el medio, quién no está disponible y qué reemplazos hay. No modifica nada.
 *
 * Los errores esperados (datos inválidos, sin permiso) se DEVUELVEN: en producción Next oculta el mensaje de un error
 * lanzado desde una acción y el usuario no sabría qué corregir.
 */
export async function simulateCustomerAssignment(request: PlannerRequest) {
  const parsed = plannerSchema.safeParse(request);
  if (!parsed.success) return { ok: false as const, error: 'Los datos de la simulación no son válidos' };
  const window = buildWindow(parsed.data.from, parsed.data.to);
  if (!window) {
    return {
      ok: false as const,
      error: `El período no es válido: la fecha de fin debe ser igual o posterior al inicio y no superar ${MAX_WINDOW_DAYS} días`,
    };
  }

  const kinds = await getVisibleFitKinds();
  if (kinds.length === 0) {
    return { ok: false as const, error: 'No tenés permiso para ver la documentación de personal ni de equipos' };
  }

  try {
    const companyId = await getActiveCompanyId();
    const output = await runAssignmentPlanner(companyId, kinds, {
      customerId: parsed.data.customerId,
      window,
      employeeIds: parsed.data.employeeIds,
      equipmentIds: parsed.data.equipmentIds,
    });
    return { ok: true as const, output };
  } catch (error) {
    logger.error('Error al simular la asignación', { data: { error } });
    throw new Error('No se pudo simular la asignación');
  }
}

export type SimulationOutput = Extract<Awaited<ReturnType<typeof simulateCustomerAssignment>>, { ok: true }>['output'];

const rowSchema = z.object({
  customerId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeIds: z.array(z.string().uuid()).max(100),
  equipmentIds: z.array(z.string().uuid()).max(100),
});

/**
 * Aviso del parte diario: personas y equipos de la línea que no cumplen la documentación que pide el cliente en la
 * fecha del parte. Solo informa (no bloquea el guardado). Sin permiso de documentación devuelve una lista vacía.
 */
export async function getRowResourcesDocumentWarnings(request: z.infer<typeof rowSchema>) {
  const parsed = rowSchema.safeParse(request);
  if (!parsed.success) return [];
  const kinds = await getVisibleFitKinds();
  if (kinds.length === 0) return [];
  try {
    const companyId = await getActiveCompanyId();
    return await loadRowResourceWarnings(companyId, kinds, parsed.data);
  } catch (error) {
    logger.error('Error al revisar la documentación de los recursos de la línea', { data: { error } });
    throw new Error('No se pudo revisar la documentación de los recursos');
  }
}

export type RowResourcesDocumentWarnings = Awaited<ReturnType<typeof getRowResourcesDocumentWarnings>>;
