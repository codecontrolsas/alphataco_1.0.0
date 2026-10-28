import 'server-only';

import { prismaSystem } from '@/shared/lib/prisma-system';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { routeModules, type ModuleKey } from '../catalog';
import { getEnabledModulesFor } from './modules.server';

/**
 * Corte por módulo de las rutas públicas (F3.3): `/maintenance` (QR), `/operator`, `/clothing` y `/portal` no pasan por
 * el proxy ni tienen empresa activa en la sesión. La empresa sale del objeto que la propia ruta identifica (el equipo del
 * QR, el operario, el legajo) y, mientras no se conoce, se corta por la instancia. Los dueños de cada URL salen del
 * catálogo (`routeModules`), no se repiten acá.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Empresa dueña de un equipo del QR (cliente de sistema: es una ruta pública). `null` si no existe o el id es inválido. */
async function equipmentCompanyId(equipmentId: string): Promise<string | null> {
  if (!UUID_RE.test(equipmentId)) return null;
  const vehicle = await prismaSystem.vehicles.findUnique({ where: { id: equipmentId }, select: { company_id: true } });
  return vehicle?.company_id ?? null;
}

/**
 * Claves encendidas para la empresa del equipo del QR. Si el equipo no existe devuelve `null`: la página ya redirige
 * con su propio mensaje y no se corta acá.
 */
export async function getEquipmentModules(equipmentId: string): Promise<ReadonlySet<ModuleKey> | null> {
  const companyId = await equipmentCompanyId(equipmentId);
  return companyId ? getEnabledModulesFor(companyId) : null;
}

/** `true` si alguna de las claves que habilitan la URL está encendida (o la URL no pertenece a ninguna apagable). */
export function isRouteEnabled(pathname: string, enabled: ReadonlySet<ModuleKey>): boolean {
  const required = routeModules(pathname);
  return !required || required.some((key) => enabled.has(key));
}

/** 404 si el módulo dueño de la URL del QR está apagado para la empresa del equipo. */
export async function requireEquipmentRoute(pathname: string, equipmentId: string): Promise<void> {
  const enabled = await getEquipmentModules(equipmentId);
  if (enabled && !isRouteEnabled(pathname, enabled)) notFound();
}

/**
 * 404 si la URL pública está apagada para la INSTANCIA (todavía no se conoce la empresa: login del QR, de indumentaria o
 * del operario). Si la base falla se corta (solo queda el núcleo), igual que el resto de los cortes de servidor.
 */
export async function requireInstanceRoute(pathname: string): Promise<void> {
  await connection();
  if (!isRouteEnabled(pathname, await getEnabledModulesFor(null))) notFound();
}

/** 404 si la URL pública está apagada para la empresa ya identificada (operario, legajo). */
export async function requireCompanyRoute(pathname: string, companyId: string): Promise<void> {
  if (!isRouteEnabled(pathname, await getEnabledModulesFor(companyId))) notFound();
}

/** Igual que `requireCompanyRoute` pero devuelve un booleano: para actions públicas que responden con su propio error. */
export async function isRouteEnabledForCompany(pathname: string, companyId: string): Promise<boolean> {
  return isRouteEnabled(pathname, await getEnabledModulesFor(companyId));
}
