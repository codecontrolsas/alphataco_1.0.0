'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { type type_equipment } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { errorMessage, fail, ok, type ActionResult } from '../lib/action-result';
import { assertComercialView, requireComercialPermission } from '../lib/require-permission.server';
import {
  CUSTOMER_EQUIPMENT_TYPES,
  customerEquipmentFormSchema,
  type CustomerEquipmentFormValues,
  type CustomerEquipmentTypeLabel,
} from '../schemas/customer-equipment';

const logger = new Logger('features/Empresa/Clientes/customer-equipment');

const COMERCIAL_PATH = '/dashboard/comercial';

/** Etiqueta de la UI ↔ valor del enum de Prisma (`@map`). */
const TYPE_LABEL_TO_ENUM: Record<CustomerEquipmentTypeLabel, type_equipment> = {
  Perforador: 'Perforador',
  'Perforador Spudder': 'Perforador_Spudder',
  'Work over': 'Work_over',
  Fractura: 'Fractura',
  'Coiled Tubing': 'Coiled_Tubing',
};

const TYPE_ENUM_TO_LABEL = Object.fromEntries(
  Object.entries(TYPE_LABEL_TO_ENUM).map(([label, value]) => [value, label])
) as Record<type_equipment, CustomerEquipmentTypeLabel>;

function toTypeLabel(value: type_equipment): CustomerEquipmentTypeLabel {
  return TYPE_ENUM_TO_LABEL[value] ?? CUSTOMER_EQUIPMENT_TYPES[0];
}

/** Equipos de los clientes de la empresa activa (`type` como etiqueta de la UI). */
export async function getCustomerEquipments() {
  await assertComercialView(['equipos-cliente']);
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.equipos_clientes.findMany({
      where: { customers: { company_id: companyId } },
      select: {
        id: true,
        name: true,
        type: true,
        customer_id: true,
        created_at: true,
        customers: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({ ...row, type: toTypeLabel(row.type) }));
  } catch (error) {
    logger.error('Error al obtener equipos de clientes', { data: { error, companyId } });
    throw error;
  }
}

export type CustomerEquipmentRow = Awaited<ReturnType<typeof getCustomerEquipments>>[number];

/** Equipos de UN cliente de la empresa activa (la ficha del cliente). */
export async function getCustomerEquipmentsByCustomer(customerId: string) {
  if (!customerId) return [];
  if (!(await checkPermissionServer('comercial', 'equipos-cliente', 'view'))) {
    throw new Error('No tenés permiso para ver los equipos del cliente');
  }
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.equipos_clientes.findMany({
      where: { customer_id: customerId, customers: { company_id: companyId } },
      select: {
        id: true,
        name: true,
        type: true,
        customer_id: true,
        created_at: true,
        customers: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({ ...row, type: toTypeLabel(row.type) }));
  } catch (error) {
    logger.error('Error al obtener equipos del cliente', { data: { error, customerId } });
    throw error;
  }
}

async function assertCustomerOwned(customerId: string, companyId: string): Promise<void> {
  const customer = await prisma.customers.findFirst({
    where: { id: customerId, company_id: companyId },
    select: { id: true },
  });
  if (!customer) throw new Error('Cliente no encontrado');
}

export async function createCustomerEquipment(
  input: CustomerEquipmentFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerEquipmentFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const values = parsed.data;

  const permissionError = await requireComercialPermission('equipos-cliente', 'create');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    await assertCustomerOwned(values.customer_id, companyId);
    const created = await prisma.equipos_clientes.create({
      data: { name: values.name, customer_id: values.customer_id, type: TYPE_LABEL_TO_ENUM[values.type] },
      select: { id: true },
    });
    logger.info('Equipo de cliente creado', { data: { id: created.id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id: created.id });
  } catch (error) {
    logger.error('Error al crear el equipo de cliente', { data: { error } });
    return fail(errorMessage(error, 'Error al crear el equipo'));
  }
}

export async function updateCustomerEquipment(
  input: CustomerEquipmentFormValues & { id: string }
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerEquipmentFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const values = parsed.data;

  const permissionError = await requireComercialPermission('equipos-cliente', 'update');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    await assertCustomerOwned(values.customer_id, companyId);
    const updated = await prisma.equipos_clientes.updateMany({
      where: { id: input.id, customers: { company_id: companyId } },
      data: { name: values.name, customer_id: values.customer_id, type: TYPE_LABEL_TO_ENUM[values.type] },
    });
    if (updated.count === 0) return fail('Equipo no encontrado o no actualizado.');
    logger.info('Equipo de cliente actualizado', { data: { id: input.id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id: input.id });
  } catch (error) {
    logger.error('Error al actualizar el equipo de cliente', { data: { error, id: input.id } });
    return fail(errorMessage(error, 'Error al actualizar el equipo'));
  }
}
