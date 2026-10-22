import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import type { PurchaseRequestInput } from '../schemas/requests';
import { PurchaseError } from './purchase-errors';
import { nextPurchaseRequestNumber } from './request-numbering';
import { dateColumn, destinationColumns, validatePurchaseRequestInput, type ValidatedLine } from './requests';

/** Escrituras de una solicitud de compra dentro de una transacción: alta ya validada, líneas y lectura del borrador guardado. */
type Tx = Prisma.TransactionClient;

export async function writeLines(tx: Tx, requestId: string, lines: ValidatedLine[]) {
  await tx.purchase_request_lines.createMany({
    data: lines.map((line, i) => ({ ...line, request_id: requestId, position: i + 1 })),
  });
}

/** Alta de una solicitud ya validada (la usan el alta comun y la que sale de un pedido). */
export async function insertPurchaseRequest(
  tx: Tx,
  companyId: string,
  profileId: string,
  input: PurchaseRequestInput,
  options: { submit: boolean; materialRequestId: string | null }
) {
  const lines = await validatePurchaseRequestInput(tx, companyId, input);
  const number = await nextPurchaseRequestNumber(tx, companyId);
  const request = await tx.purchase_requests.create({
    data: {
      number,
      status: options.submit ? 'PENDING_APPROVAL' : 'DRAFT',
      requested_by: profileId,
      needed_by: dateColumn(input.neededBy),
      notes: input.notes,
      material_request_id: options.materialRequestId,
      submitted_at: options.submit ? new Date() : null,
      ...destinationColumns(input),
    },
    select: { id: true, number: true },
  });
  await writeLines(tx, request.id, lines);
  return request;
}

/**
 * Un borrador generado desde un pedido de Almacenes sigue atado al pedido al editarlo: conserva
 * el destino del pedido (el del formulario se ignora) y solo admite materiales del pedido.
 */
export async function constrainToMaterialRequest(
  tx: Tx,
  requestId: string,
  input: PurchaseRequestInput
): Promise<PurchaseRequestInput> {
  const stored = await tx.purchase_requests.findUniqueOrThrow({
    where: { id: requestId },
    select: {
      material_request_id: true,
      destination_type: true,
      employee_id: true,
      vehicle_id: true,
      other_equipment_id: true,
      maintenance_order_id: true,
      customer_id: true,
      customer_service_id: true,
      material_request: { select: { number: true, lines: { select: { material_id: true } } } },
    },
  });
  if (!stored.material_request_id || !stored.material_request) return input;
  const allowed = new Set(stored.material_request.lines.map((l) => l.material_id));
  input.lines.forEach((line, i) => {
    if (!line.materialId || !allowed.has(line.materialId)) {
      throw new PurchaseError(`Línea ${i + 1}: solo se piden materiales del pedido ${stored.material_request!.number}`);
    }
  });
  return {
    ...input,
    destination: {
      destinationType: stored.destination_type,
      employeeId: stored.employee_id,
      vehicleId: stored.vehicle_id,
      otherEquipmentId: stored.other_equipment_id,
      maintenanceOrderId: stored.maintenance_order_id,
      customerId: stored.customer_id,
      customerServiceId: stored.customer_service_id,
    },
  };
}

/** Formulario guardado de un borrador, para volver a editarlo. */
export async function inputFromStored(tx: Tx, requestId: string): Promise<PurchaseRequestInput> {
  const stored = await tx.purchase_requests.findUniqueOrThrow({
    where: { id: requestId },
    select: {
      destination_type: true,
      employee_id: true,
      vehicle_id: true,
      other_equipment_id: true,
      maintenance_order_id: true,
      customer_id: true,
      customer_service_id: true,
      needed_by: true,
      notes: true,
      lines: {
        select: {
          material_id: true,
          description: true,
          quantity: true,
          unit_id: true,
          suggested_supplier_id: true,
          notes: true,
        },
        orderBy: { position: 'asc' },
      },
    },
  });
  return {
    destination: {
      destinationType: stored.destination_type,
      employeeId: stored.employee_id,
      vehicleId: stored.vehicle_id,
      otherEquipmentId: stored.other_equipment_id,
      maintenanceOrderId: stored.maintenance_order_id,
      customerId: stored.customer_id,
      customerServiceId: stored.customer_service_id,
    },
    neededBy: stored.needed_by ? stored.needed_by.toISOString().slice(0, 10) : null,
    notes: stored.notes,
    lines: stored.lines.map((l) => ({
      materialId: l.material_id,
      description: l.description,
      quantity: l.quantity.toString(),
      unitId: l.material_id ? null : l.unit_id,
      suggestedSupplierId: l.suggested_supplier_id,
      notes: l.notes,
    })),
  };
}
