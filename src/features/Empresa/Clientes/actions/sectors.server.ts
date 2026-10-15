'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { errorMessage, fail, ok, type ActionResult } from '../lib/action-result';
import { assertComercialView, requireComercialPermission } from '../lib/require-permission.server';
import { SECTOR_SELECT, serializeSector } from '../lib/sector-row';
import { sectorFormSchema, type SectorFormValues } from '../schemas/sector';

const logger = new Logger('features/Empresa/Clientes/sectors');

const COMERCIAL_PATH = '/dashboard/comercial';

/**
 * Un sector pertenece a UN cliente (`sectors.customer_id`), y el cliente a una empresa.
 *
 * Antes `sectors` era una tabla global y la pertenencia salía de la pivote `sector_customer`,
 * con la consecuencia de que un mismo sector podía estar compartido entre clientes y entre
 * empresas. La pivote se eliminó (tsk-745): el diff de asignaciones que había acá ya venía
 * operando de hecho como 1:1, porque el formulario nunca mandó más de un cliente.
 */

/** Sectores de los clientes de la empresa activa (lo que lista la tabla de Sectores). */
export async function getSectors() {
  await assertComercialView(['sectores-cliente', 'service']);
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.sectors.findMany({
      where: { customers: { company_id: companyId } },
      select: SECTOR_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(serializeSector);
  } catch (error) {
    logger.error('Error al obtener sectores', { data: { error, companyId } });
    throw error;
  }
}

export type SectorRow = Awaited<ReturnType<typeof getSectors>>[number];

/** Sectores de UN cliente de la empresa activa (pestaña "Sectores" de la ficha). */
export async function getSectorsByCustomer(customerId: string): Promise<SectorRow[]> {
  if (!(await checkPermissionServer('comercial', 'sectores-cliente', 'view'))) {
    throw new Error('No tenés permiso para ver los sectores del cliente');
  }
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.sectors.findMany({
      where: { customer_id: customerId, customers: { company_id: companyId } },
      select: SECTOR_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(serializeSector);
  } catch (error) {
    logger.error('Error al obtener los sectores del cliente', { data: { error, customerId } });
    throw new Error('No se pudieron cargar los sectores del cliente');
  }
}

async function assertCustomerOwned(customerId: string, companyId: string): Promise<void> {
  const customer = await prisma.customers.findFirst({
    where: { id: customerId, company_id: companyId },
    select: { id: true },
  });
  if (!customer) throw new Error('Cliente no encontrado');
}

/** Traduce el choque contra `@@unique([customer_id, name])` a un mensaje que se entienda. */
function nombreRepetido(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function createSector(input: SectorFormValues): Promise<ActionResult<{ id: string }>> {
  const parsed = sectorFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const values = parsed.data;

  const permissionError = await requireComercialPermission('sectores-cliente', 'create');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    await assertCustomerOwned(values.customer_id, companyId);
    const created = await prisma.sectors.create({
      data: {
        customer_id: values.customer_id,
        name: values.name,
        descripcion_corta: values.descripcion_corta,
      },
      select: { id: true },
    });
    logger.info('Sector creado', { data: { sectorId: created.id, customerId: values.customer_id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id: created.id });
  } catch (error) {
    if (nombreRepetido(error)) return fail('Ese cliente ya tiene un sector con ese nombre');
    logger.error('Error al crear el sector', { data: { error } });
    return fail(errorMessage(error, 'Error al crear el sector'));
  }
}

export async function updateSector(input: SectorFormValues & { id: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = sectorFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const values = parsed.data;
  const sectorId = input.id;

  const permissionError = await requireComercialPermission('sectores-cliente', 'update');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    // Perímetro: el sector tiene que ser de un cliente de la empresa activa. No lo garantiza la
    // base (no hay RLS), así que se verifica acá antes de escribir.
    const sector = await prisma.sectors.findFirst({
      where: { id: sectorId, customers: { company_id: companyId } },
      select: { id: true },
    });
    if (!sector) return fail('Sector no encontrado');
    await assertCustomerOwned(values.customer_id, companyId);

    await prisma.sectors.update({
      where: { id: sectorId },
      data: {
        customer_id: values.customer_id,
        name: values.name,
        descripcion_corta: values.descripcion_corta,
      },
    });

    logger.info('Sector actualizado', { data: { sectorId } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id: sectorId });
  } catch (error) {
    if (nombreRepetido(error)) return fail('Ese cliente ya tiene un sector con ese nombre');
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return fail(
        'No se puede cambiar el cliente del sector porque está siendo utilizado en contratos o partes diarios'
      );
    }
    logger.error('Error al actualizar el sector', { data: { error, sectorId } });
    return fail(errorMessage(error, 'Error al actualizar el sector'));
  }
}
