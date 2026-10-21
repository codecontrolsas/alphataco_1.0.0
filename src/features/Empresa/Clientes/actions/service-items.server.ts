'use server';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { errorMessage, fail, ok, type ActionResult } from '../lib/action-result';
import { priceChanged, writePriceRevision } from '../lib/price-revision-writer';
import { requireComercialPermission } from '../lib/require-permission.server';
import { serviceItemFormSchema, type ServiceItemFormValues } from '../schemas/service-item';

const logger = new Logger('features/Empresa/Clientes/service-items');

const itemInclude = {
  measure_units: { select: { id: true, unit: true, simbol: true, tipo: true } },
  customer_services: {
    select: { id: true, service_name: true, customer_id: true, customers: { select: { id: true, name: true } } },
  },
} satisfies Prisma.service_itemsInclude;

type ItemWithRelations = Prisma.service_itemsGetPayload<{ include: typeof itemInclude }>;

/**
 * `item_price` es `Decimal(15,4)`: hacia el cliente viaja como string para no perder precisión. Sin
 * `view_prices` viaja `null`: el importe no sale del servidor.
 */
function serializeItem({ item_price, ...rest }: ItemWithRelations, canViewPrices: boolean) {
  return { ...rest, item_price: canViewPrices ? item_price.toString() : null };
}

export type ServiceItemRow = ReturnType<typeof serializeItem>;

/** Resuelve en el servidor si el usuario ve los importes de los items de contrato. */
async function canViewItemPrices(): Promise<boolean> {
  return (await requireComercialPermission('items-contrato', 'view_prices')) === null;
}

async function findItems(customerServiceId: string, companyId: string, onlyActive: boolean) {
  const canViewPrices = await canViewItemPrices();
  const rows = await prisma.service_items.findMany({
    where: {
      customer_service_id: customerServiceId,
      company_id: companyId,
      ...(onlyActive ? { is_active: true } : {}),
    },
    include: itemInclude,
    orderBy: { item_name: 'asc' },
  });
  return rows.map((row) => serializeItem(row, canViewPrices));
}

/** Todos los items (activos e inactivos) de un contrato de la empresa activa. */
export async function getServiceItemsByContract(customerServiceId: string): Promise<ServiceItemRow[]> {
  if (!customerServiceId) return [];
  const permissionError = await requireComercialPermission('items-contrato', 'view');
  if (permissionError) throw new Error(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    return await findItems(customerServiceId, companyId, false);
  } catch (error) {
    logger.error('Error al obtener items del contrato', { data: { error, customerServiceId } });
    throw error;
  }
}

/** Sólo los items activos de un contrato (selectores de partes diarios / prepartes). */
export async function getActiveServiceItems(customerServiceId: string): Promise<ServiceItemRow[]> {
  if (!customerServiceId) return [];
  const companyId = await getActiveCompanyId();
  try {
    return await findItems(customerServiceId, companyId, true);
  } catch (error) {
    logger.error('Error al obtener items activos del contrato', { data: { error, customerServiceId } });
    return [];
  }
}

function toItemData(values: ServiceItemFormValues) {
  return {
    item_name: values.item_name,
    item_description: values.item_description ?? '',
    code_item: values.code_item || null,
    item_number: values.item_number || null,
    item_measure_units: Number(values.item_measure_units),
    item_price: new Prisma.Decimal(values.item_price),
    vat_rate_id: Number(values.vat_rate_id),
    is_active: values.is_active,
    needs_personnel: values.needs_personnel,
    needs_equipment: values.needs_equipment,
  };
}

async function assertMeasureUnitExists(id: number): Promise<void> {
  const unit = await prisma.measure_units.findUnique({ where: { id }, select: { id: true } });
  if (!unit) throw new Error('Unidad de medida inválida');
}

/** Alta de item en un contrato de la empresa activa. */
export async function createServiceItem(
  customerServiceId: string,
  input: ServiceItemFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = serviceItemFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const permissionError = await requireComercialPermission('items-contrato', 'create');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    const service = await prisma.customer_services.findFirst({
      // Perímetro por la relación (customer_services.company_id es nullable).
      where: { id: customerServiceId, customers: { company_id: companyId } },
      select: { id: true },
    });
    if (!service) return fail('Contrato no encontrado');
    const data = toItemData(parsed.data);
    await assertMeasureUnitExists(data.item_measure_units);

    // Fijar un precio inicial es fijar un importe: exige `update_prices`.
    if (!data.item_price.isZero()) {
      const priceError = await requireComercialPermission('items-contrato', 'update_prices');
      if (priceError) return fail(priceError);
    }

    const createdBy = await getSessionUserId();

    // El alta siembra la primera revisión: si el historial arrancara en el primer AUMENTO, el
    // precio original del contrato no quedaría registrado en ninguna parte.
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.service_items.create({
        data: { ...data, customer_service_id: customerServiceId, },
        select: { id: true },
      });
      await writePriceRevision(tx, {
        serviceItemId: item.id,
        price: data.item_price,
        previousPrice: null,
        validFrom: new Date(argentinaDate()),
        source: 'manual',
        reason: 'Precio inicial del ítem',
        createdBy,
      });
      return item;
    });

    logger.info('Item de contrato creado', { data: { itemId: created.id, customerServiceId } });
    return ok({ id: created.id });
  } catch (error) {
    logger.error('Error al crear el item', { data: { error, customerServiceId } });
    return fail(errorMessage(error, 'Error al crear el item'));
  }
}

/** Edición de un item de la empresa activa. */
export async function updateServiceItem(
  itemId: string,
  input: ServiceItemFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = serviceItemFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const permissionError = await requireComercialPermission('items-contrato', 'update');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    const data = toItemData(parsed.data);
    await assertMeasureUnitExists(data.item_measure_units);

    const actual = await prisma.service_items.findFirst({
      where: { id: itemId, company_id: companyId },
      select: { id: true, item_price: true },
    });
    if (!actual) return fail('Item no encontrado');

    // El form del ítem también puede cambiar el precio. Si se escribiera con el resto de los
    // campos, ese cambio no dejaría revisión y el historial mentiría: pasa por el mismo
    // escritor que el cambio manual y la corrida de una regla.
    // Sin `view_prices` el form no conoce el precio vigente (viaja null): el precio entrante se
    // ignora y se conserva el actual. Con `view_prices`, cambiarlo exige `update_prices`.
    const canViewPrices = await canViewItemPrices();
    const cambioPrecio = canViewPrices && priceChanged(actual.item_price, data.item_price);
    if (cambioPrecio) {
      const priceError = await requireComercialPermission('items-contrato', 'update_prices');
      if (priceError) return fail(priceError);
    }
    const { item_price, ...sinPrecio } = data;
    const createdBy = cambioPrecio ? await getSessionUserId() : null;

    await prisma.$transaction(async (tx) => {
      await tx.service_items.update({ where: { id: itemId }, data: sinPrecio });
      if (cambioPrecio) {
        await writePriceRevision(tx, {
          serviceItemId: itemId,
          price: item_price,
          previousPrice: actual.item_price,
          validFrom: new Date(argentinaDate()),
          source: 'manual',
          reason: 'Precio editado desde el ítem',
          createdBy,
        });
      }
    });

    logger.info('Item de contrato actualizado', { data: { itemId, cambioPrecio } });
    return ok({ id: itemId });
  } catch (error) {
    logger.error('Error al actualizar el item', { data: { error, itemId } });
    return fail(errorMessage(error, 'Error al actualizar el item'));
  }
}
