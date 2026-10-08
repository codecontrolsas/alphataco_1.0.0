'use server';

import {
  assertClothingBrandInCompany,
  assertClothingItemInCompany,
  assertClothingSizeInCompany,
  assertEmployeeInCompany,
  assertWarehouseInCompany,
  requireClothingOperator,
} from '@/features/Clothing/actions/perimeter';
import {
  groupQuantitiesByMaterial,
  isDeliveryType,
  linesWithoutBrandOrSize,
  normalizeDeliveryItems,
  type RawDeliveryItem,
} from '@/features/Clothing/lib/delivery-items';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { toActionError } from '@/features/Warehouses/lib/action-errors';
import { registerStockMovement } from '@/features/Warehouses/lib/stock-engine';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Clothing/Delivery/mutations');

/** Varias lineas toman varios locks del motor: mas margen que los 5 s por defecto. */
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

/**
 * Entrada del asistente de entrega.
 *
 * Ya NO lleva `companyId` ni `deliveredById`: la empresa y el entregador salen del operario
 * de la sesión. Antes los tres venían del cliente, con lo que se podían crear entregas en
 * cualquier empresa, a nombre de cualquier empleado.
 *
 * `warehouseId` (Almacenes etapa 5): deposito del que sale la ropa; lo elige quien entrega.
 */
export type CreateDeliveryInput = {
  employeeId: string;
  warehouseId: string;
  deliveryType: string;
  signatureUrl?: string;
  notes?: string;
  deliveredAt: string;
  items: RawDeliveryItem[];
};

/** Valida contra la empresa del operario cada artículo, marca y talle que llega del cliente. */
async function assertItemsInCompany(
  items: ReturnType<typeof normalizeDeliveryItems>,
  companyId: string
): Promise<void> {
  const itemIds = [...new Set(items.map((item) => item.clothingItemId))];
  const brandIds = [...new Set(items.map((item) => item.clothingBrandId).filter((id): id is string => id != null))];
  const sizeIds = [...new Set(items.map((item) => item.clothingSizeId).filter((id): id is string => id != null))];

  await Promise.all([
    ...itemIds.map((id) => assertClothingItemInCompany(id, companyId)),
    ...brandIds.map((id) => assertClothingBrandInCompany(id, companyId)),
    ...sizeIds.map((id) => assertClothingSizeInCompany(id, companyId)),
  ]);
}

/**
 * Registra una entrega de ropa y su salida de stock en UNA transaccion (Almacenes etapa 5): si
 * falta stock, el motor rechaza y no queda ni la entrega ni la salida.
 *
 * Perímetro: empresa y entregador salen del operario de la sesión; el empleado receptor, el
 * deposito y cada artículo/marca/talle tienen que ser de esa misma empresa.
 *
 * Devuelve `ActionResult` (y no lanza) para que el mensaje del motor ("Stock insuficiente de
 * Camisa · Ombú · 42…") llegue al operario tambien en produccion.
 */
export async function createClothingDelivery(data: CreateDeliveryInput): Promise<ActionResult<{ id: string }>> {
  let operator: Awaited<ReturnType<typeof requireClothingOperator>>;
  try {
    operator = await requireClothingOperator();
  } catch {
    return fail('Tu sesión expiró. Volvé a ingresar.');
  }
  logger.debug('Creating clothing delivery', {
    data: { employeeId: data.employeeId, warehouseId: data.warehouseId, itemCount: data.items.length },
  });

  const deliveryType = data.deliveryType;
  if (!isDeliveryType(deliveryType)) return fail('Tipo de entrega inválido');

  const items = normalizeDeliveryItems(data.items);
  if (items.length === 0) return fail('La entrega no tiene artículos válidos');
  if (linesWithoutBrandOrSize(items).length > 0) {
    return fail('Cada artículo tiene que tener marca y talle: el stock se lleva por combinación');
  }

  // La entrega queda con la fecha y hora del SERVIDOR (el asistente dice "fecha y hora actual"):
  // tambien fecha la salida de stock, asi que no se acepta una fecha armada en el cliente.
  const deliveredAt = new Date();

  try {
    await assertEmployeeInCompany(data.employeeId, operator.companyId);
    await assertWarehouseInCompany(data.warehouseId, operator.companyId);
    await assertItemsInCompany(items, operator.companyId);
  } catch (error) {
    logger.warn('Entrega de ropa fuera del perimetro', { data: { error } });
    return fail(error instanceof Error ? error.message : 'Datos inválidos');
  }

  try {
    const delivery = await withActor(
      operator.userId,
      async (tx) => {
        // Material de cada linea: la combinacion tiene que estar en la matriz y tener material.
        const links = await tx.clothing_item_materials.findMany({
          where: {
            company_id: operator.companyId,
            OR: items.map((item) => ({
              clothing_item_id: item.clothingItemId,
              clothing_brand_id: item.clothingBrandId!,
              clothing_size_id: item.clothingSizeId!,
            })),
          },
          select: {
            clothing_item_id: true,
            clothing_brand_id: true,
            clothing_size_id: true,
            material: { select: { id: true, name: true, is_active: true } },
          },
        });
        const byCombination = new Map(
          links.map((l) => [`${l.clothing_item_id}|${l.clothing_brand_id}|${l.clothing_size_id}`, l.material])
        );
        const materialLines = items.map((item) => {
          const material = byCombination.get(`${item.clothingItemId}|${item.clothingBrandId}|${item.clothingSizeId}`);
          // Inactivo = la combinacion se quito de la matriz o el articulo, la marca o el talle estan
          // dados de baja (`syncClothingMaterials`). El motor no bloquea salidas de inactivos: aca si.
          if (!material || !material.is_active) {
            throw new StockError(
              'NOT_FOUND',
              material
                ? `${material.name} no está habilitado en el catálogo de Ropa`
                : 'Una de las combinaciones de artículo, marca y talle no está habilitada en el catálogo'
            );
          }
          return { materialId: material.id, quantity: item.quantity };
        });

        const created = await tx.clothing_deliveries.create({
          data: {
            employee_id: data.employeeId,
            delivered_by_id: operator.employeeId,
            delivery_type: deliveryType,
            signature_url: data.signatureUrl ?? null,
            notes: data.notes ?? null,
            delivered_at: deliveredAt,
            company_id: operator.companyId,
            warehouse_id: data.warehouseId,
            clothing_delivery_items: {
              createMany: {
                data: items.map((item) => ({
                  clothing_item_id: item.clothingItemId,
                  clothing_brand_id: item.clothingBrandId,
                  clothing_size_id: item.clothingSizeId,
                  quantity: item.quantity,
                  has_certificate: item.hasCertificate,
                })),
              },
            },
          },
          select: { id: true },
        });

        const movement = await registerStockMovement(tx, operator.companyId, operator.profileId, {
          type: 'EXIT',
          warehouseId: data.warehouseId,
          targetWarehouseId: null,
          occurredOn: deliveredAt,
          reference: 'Entrega de ropa',
          notes: data.notes?.trim() || null,
          destinationType: 'EMPLOYEE',
          employeeId: data.employeeId,
          vehicleId: null,
          otherEquipmentId: null,
          maintenanceOrderId: null,
          customerId: null,
          customerServiceId: null,
          lines: groupQuantitiesByMaterial(materialLines).map((line) => ({
            materialId: line.materialId,
            quantity: String(line.quantity),
            unitCost: null,
            adjustmentDirection: null,
            batchId: null,
            batchNumber: null,
            batchExpiresOn: null,
            serialNumbers: [],
            unitIds: [],
          })),
        });

        await tx.clothing_deliveries.update({ where: { id: created.id }, data: { stock_movement_id: movement.id } });
        return created;
      },
      prisma,
      TRANSACTION_OPTIONS
    );

    logger.info('Clothing delivery created', { data: { deliveryId: delivery.id } });
    return ok({ id: delivery.id });
  } catch (error) {
    return toActionError(error, logger, 'registrar la entrega');
  }
}
