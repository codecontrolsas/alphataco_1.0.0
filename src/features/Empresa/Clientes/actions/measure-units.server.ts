'use server';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { errorMessage, fail, ok, type ActionResult } from '../lib/action-result';
import { assertComercialView, requireComercialPermission } from '../lib/require-permission.server';
import { measureUnitFormSchema, type MeasureUnitFormValues } from '../schemas/measure-unit';

const logger = new Logger('features/Empresa/Clientes/measure-units');

const COMERCIAL_PATH = '/dashboard/comercial';

/**
 * Unidades de medida: catálogo global (sin `company_id`). Se exige sesión con empresa activa
 * para no exponer el catálogo sin autenticación.
 */
export async function getMeasureUnits() {
  await assertComercialView(['mensure_units', 'service', 'items-contrato']);
  await getActiveCompanyId();
  try {
    return await prisma.measure_units.findMany({ orderBy: { unit: 'asc' } });
  } catch (error) {
    logger.error('Error al obtener unidades de medida', { data: { error } });
    throw error;
  }
}

export type MeasureUnitRow = Awaited<ReturnType<typeof getMeasureUnits>>[number];

export async function createMeasureUnit(input: MeasureUnitFormValues): Promise<ActionResult<{ id: number }>> {
  const parsed = measureUnitFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const permissionError = await requireComercialPermission('mensure_units', 'create');
  if (permissionError) return fail(permissionError);
  await getActiveCompanyId();

  try {
    const existing = await prisma.measure_units.findFirst({
      where: { simbol: parsed.data.simbol },
      select: { id: true },
    });
    if (existing) return fail('Ya existe una unidad de medida con este símbolo');

    const created = await prisma.measure_units.create({ data: parsed.data, select: { id: true } });
    logger.info('Unidad de medida creada', { data: { id: created.id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id: created.id });
  } catch (error) {
    logger.error('Error al crear unidad de medida', { data: { error } });
    return fail(errorMessage(error, 'Error del servidor al crear la unidad de medida'));
  }
}

export async function updateMeasureUnit(
  id: number,
  input: MeasureUnitFormValues
): Promise<ActionResult<{ id: number }>> {
  const parsed = measureUnitFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const permissionError = await requireComercialPermission('mensure_units', 'update');
  if (permissionError) return fail(permissionError);
  await getActiveCompanyId();

  try {
    const existing = await prisma.measure_units.findFirst({
      where: { simbol: parsed.data.simbol, id: { not: id } },
      select: { id: true },
    });
    if (existing) return fail('Ya existe otra unidad de medida con este símbolo');

    await prisma.measure_units.update({ where: { id }, data: parsed.data });
    logger.info('Unidad de medida actualizada', { data: { id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('Unidad de medida no encontrada');
    }
    logger.error('Error al actualizar unidad de medida', { data: { error, id } });
    return fail(errorMessage(error, 'Error del servidor al actualizar la unidad de medida'));
  }
}

export async function deleteMeasureUnit(id: number): Promise<ActionResult> {
  const permissionError = await requireComercialPermission('mensure_units', 'update');
  if (permissionError) return fail(permissionError);
  await getActiveCompanyId();
  try {
    const inUse = await prisma.service_items.count({ where: { item_measure_units: id } });
    if (inUse > 0) {
      return fail(`No se puede eliminar: la unidad está en uso por ${inUse} item${inUse === 1 ? '' : 's'} de contrato`);
    }
    await prisma.measure_units.delete({ where: { id } });
    logger.info('Unidad de medida eliminada', { data: { id } });
    revalidatePath(COMERCIAL_PATH);
    return ok(null);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('Unidad de medida no encontrada');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return fail('No se puede eliminar esta unidad de medida porque está siendo utilizada');
    }
    logger.error('Error al eliminar unidad de medida', { data: { error, id } });
    return fail(errorMessage(error, 'Error del servidor al eliminar la unidad de medida'));
  }
}
