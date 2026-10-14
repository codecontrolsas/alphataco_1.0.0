import 'server-only';

import { assertVehicleInActiveCompany } from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { z } from 'zod';

/**
 * Perímetro y permiso de la pestaña Cubiertas del equipo.
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público: la empresa la resuelve el servidor y el
 * permiso se verifica acá, no en el botón del cliente. Estas acciones solo se llaman desde la pestaña
 * Cubiertas del detalle del equipo (Mantenimiento/Gomería tiene sus propias acciones con perímetro por
 * recurso para el QR), así que exigir el permiso de la pestaña no rompe otros flujos.
 *
 * Módulo server-only (NO es una Server Action).
 */

const MODULE_SLUG = 'equipos';
const TAB_SLUG = 'cubiertas-equipo';

const uuidSchema = z.string().uuid('Identificador inválido');

/** Valida el id (llega del cliente) y que el equipo sea de la empresa activa. Devuelve la empresa. */
async function assertVehicleScope(vehicleId: string): Promise<string> {
  uuidSchema.parse(vehicleId);
  return assertVehicleInActiveCompany(vehicleId);
}

/** Lectura: permiso `view` de la pestaña + equipo de la empresa activa. */
export async function requireTiresViewAccess(vehicleId: string): Promise<string> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver las cubiertas del equipo');
  }
  return assertVehicleScope(vehicleId);
}

/** Escritura: permiso `update` de la pestaña + equipo de la empresa activa. */
export async function requireTiresUpdateAccess(vehicleId: string): Promise<string> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'update'))) {
    throw new Error('No tenés permiso para modificar las cubiertas del equipo');
  }
  return assertVehicleScope(vehicleId);
}

/** Valida un input del cliente con zod y lanza con el primer mensaje legible (no el JSON de zod). */
export function parseInput<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Los datos enviados son inválidos');
  }
  return result.data;
}
