'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { salesPointSchema, type SalesPointValues } from '../schemas/fiscal-data';

const logger = new Logger('features/Empresa/General/FiscalData/sales-points');

const CONFIG_PATH = '/dashboard/configuration';

function formatNumber(n: number): string {
  return String(n).padStart(5, '0');
}

async function assertCanUpdate(): Promise<string | null> {
  const canUpdate = await checkPermissionServer('configuracion', 'datos-fiscales', 'update');
  return canUpdate ? null : 'No tenés permiso para modificar los puntos de venta';
}

export async function createSalesPoint(values: SalesPointValues): Promise<ActionResult<{ id: string }>> {
  const denied = await assertCanUpdate();
  if (denied) return fail(denied);

  const parsed = salesPointSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const companyId = await getActiveCompanyId();
  try {
    const created = await prisma.sales_points.create({
      data: { number: parsed.data.number, name: parsed.data.name },
      select: { id: true },
    });
    logger.info('Punto de venta creado', { data: { companyId, number: parsed.data.number } });
    revalidatePath(CONFIG_PATH);
    return ok(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail(`Ya existe el punto de venta ${formatNumber(parsed.data.number)}.`);
    }
    logger.error('Error al crear el punto de venta', { data: { error, companyId } });
    return fail(errorMessage(error, 'Error al crear el punto de venta'));
  }
}

export async function updateSalesPoint(id: string, values: SalesPointValues): Promise<ActionResult<null>> {
  const denied = await assertCanUpdate();
  if (denied) return fail(denied);

  const parsed = salesPointSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const companyId = await getActiveCompanyId();
  try {
    // El número es parte de la identidad fiscal de cada comprobante emitido: con comprobantes no
    // se renumera (si cambió en ARCA, es otro punto de venta: se crea uno nuevo).
    const current = await prisma.sales_points.findFirst({
      where: { id, company_id: companyId },
      select: { number: true, _count: { select: { invoices: { where: { number: { not: null } } } } } },
    });
    if (!current) return fail('Punto de venta no encontrado');
    if (current.number !== parsed.data.number && current._count.invoices > 0) {
      return fail('Este punto de venta ya tiene comprobantes emitidos: su número no se puede cambiar. Creá uno nuevo.');
    }
    const { count } = await prisma.sales_points.updateMany({
      where: { id, company_id: companyId },
      data: { number: parsed.data.number, name: parsed.data.name },
    });
    if (count === 0) return fail('Punto de venta no encontrado');
    revalidatePath(CONFIG_PATH);
    return ok(null);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail(`Ya existe el punto de venta ${formatNumber(parsed.data.number)}.`);
    }
    logger.error('Error al editar el punto de venta', { data: { error, id } });
    return fail(errorMessage(error, 'Error al editar el punto de venta'));
  }
}

/** Activar/desactivar. Un punto de venta inactivo no se ofrece en facturas nuevas. */
export async function setSalesPointActive(id: string, isActive: boolean): Promise<ActionResult<null>> {
  const denied = await assertCanUpdate();
  if (denied) return fail(denied);

  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.sales_points.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: isActive },
    });
    if (count === 0) return fail('Punto de venta no encontrado');
    revalidatePath(CONFIG_PATH);
    return ok(null);
  } catch (error) {
    logger.error('Error al cambiar el estado del punto de venta', { data: { error, id } });
    return fail(errorMessage(error, 'Error al cambiar el estado del punto de venta'));
  }
}

/** Solo se borra un punto de venta sin comprobantes; con comprobantes, se desactiva. */
export async function deleteSalesPoint(id: string): Promise<ActionResult<null>> {
  const denied = await assertCanUpdate();
  if (denied) return fail(denied);

  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.sales_points.deleteMany({ where: { id, company_id: companyId } });
    if (count === 0) return fail('Punto de venta no encontrado');
    revalidatePath(CONFIG_PATH);
    return ok(null);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return fail('Este punto de venta ya tiene comprobantes: no se puede borrar, desactivalo.');
    }
    logger.error('Error al borrar el punto de venta', { data: { error, id } });
    return fail(errorMessage(error, 'Error al borrar el punto de venta'));
  }
}
