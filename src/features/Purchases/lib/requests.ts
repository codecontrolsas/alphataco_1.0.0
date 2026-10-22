import 'server-only';

import { validateExitDestination } from '@/features/Warehouses/lib/stock-destination';
import { Prisma } from '@/generated/prisma/client';
import type { PurchaseRequestInput } from '../schemas/requests';
import { PurchaseError } from './purchase-errors';
import {
  PURCHASE_REQUEST_STATUS_PAST,
  canApplyPurchaseRequestAction,
  type PurchaseRequestAction,
  type PurchaseRequestStatus,
} from './request-state-machine';

type Tx = Prisma.TransactionClient;

export interface LockedPurchaseRequest {
  id: string;
  number: string;
  status: PurchaseRequestStatus;
  requestedBy: string;
}

/**
 * Lockea la solicitud (`FOR UPDATE`) y valida que admita la accion. Dos aprobaciones (o una
 * aprobacion y una anulacion) simultaneas se ordenan aca: la segunda ve el estado nuevo y falla
 * con "La solicitud SC-000012 ya fue aprobada".
 */
export async function lockPurchaseRequest(
  tx: Tx,
  companyId: string,
  requestId: string,
  action: PurchaseRequestAction
): Promise<LockedPurchaseRequest> {
  const rows = await tx.$queryRaw<
    { id: string; number: string; status: PurchaseRequestStatus; requested_by: string }[]
  >`
    SELECT id, number, status::text AS status, requested_by
    FROM purchase_requests
    WHERE id = ${requestId}::uuid AND company_id = ${companyId}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new PurchaseError('La solicitud no existe');
  if (!canApplyPurchaseRequestAction(row.status, action)) {
    throw new PurchaseError(`La solicitud ${row.number} ya fue ${PURCHASE_REQUEST_STATUS_PAST[row.status]}`);
  }
  return { id: row.id, number: row.number, status: row.status, requestedBy: row.requested_by };
}

export interface ValidatedLine {
  material_id: string | null;
  description: string | null;
  quantity: Prisma.Decimal;
  unit_id: string;
  suggested_supplier_id: string | null;
  notes: string | null;
}

/**
 * Valida todo lo que llega del cliente contra la empresa y devuelve las lineas listas para
 * escribir. Se usa al crear, al editar el borrador y OTRA VEZ al enviar: un borrador puede
 * quedar invalido mientras espera (proveedor desactivado, orden de mantenimiento cerrada).
 */
export async function validatePurchaseRequestInput(
  tx: Tx,
  companyId: string,
  input: PurchaseRequestInput
): Promise<ValidatedLine[]> {
  if (input.lines.length === 0) throw new PurchaseError('Agregá al menos una línea');

  const materialIds = [...new Set(input.lines.flatMap((l) => (l.materialId ? [l.materialId] : [])))];
  const unitIds = [...new Set(input.lines.flatMap((l) => (l.unitId ? [l.unitId] : [])))];
  const supplierIds = [...new Set(input.lines.flatMap((l) => (l.suggestedSupplierId ? [l.suggestedSupplierId] : [])))];

  const [materials, units, suppliers] = await Promise.all([
    tx.materials.findMany({
      where: { id: { in: materialIds }, company_id: companyId },
      select: { id: true, code: true, name: true, unit_id: true, is_active: true },
    }),
    tx.measurement_units.findMany({
      where: { id: { in: unitIds }, company_id: companyId },
      select: { id: true, name: true, is_active: true },
    }),
    tx.suppliers.findMany({
      where: { id: { in: supplierIds }, company_id: companyId },
      select: { id: true, name: true, is_active: true },
    }),
  ]);
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  const lines = input.lines.map((line, i): ValidatedLine => {
    const position = `Línea ${i + 1}`;
    if (Boolean(line.materialId) === Boolean(line.description)) {
      throw new PurchaseError(`${position}: elegí un material o describí qué se compra`);
    }
    const quantity = new Prisma.Decimal(line.quantity);
    if (!quantity.isFinite() || quantity.lte(0))
      throw new PurchaseError(`${position}: la cantidad tiene que ser mayor a 0`);

    let unitId: string;
    if (line.materialId) {
      const material = materialById.get(line.materialId);
      if (!material) throw new PurchaseError(`${position}: el material no existe`);
      if (!material.is_active)
        throw new PurchaseError(`${position}: ${material.name} (${material.code}) está inactivo`);
      unitId = material.unit_id;
    } else {
      const unit = line.unitId ? unitById.get(line.unitId) : undefined;
      if (!unit) throw new PurchaseError(`${position}: elegí la unidad`);
      if (!unit.is_active) throw new PurchaseError(`${position}: la unidad ${unit.name} está inactiva`);
      unitId = unit.id;
    }

    if (line.suggestedSupplierId) {
      const supplier = supplierById.get(line.suggestedSupplierId);
      if (!supplier) throw new PurchaseError(`${position}: el proveedor sugerido no existe`);
      if (!supplier.is_active) throw new PurchaseError(`${position}: el proveedor ${supplier.name} está inactivo`);
    }

    return {
      material_id: line.materialId,
      description: line.description,
      quantity,
      unit_id: unitId,
      suggested_supplier_id: line.suggestedSupplierId,
      notes: line.notes,
    };
  });

  if (input.destination.destinationType) await validateExitDestination(tx, companyId, input.destination);
  return lines;
}

/** Columnas de destino de la solicitud (todas NULL si es para stock). */
export function destinationColumns(input: PurchaseRequestInput) {
  const d = input.destination;
  return {
    destination_type: d.destinationType,
    employee_id: d.employeeId,
    vehicle_id: d.vehicleId,
    other_equipment_id: d.otherEquipmentId,
    maintenance_order_id: d.maintenanceOrderId,
    customer_id: d.customerId,
    customer_service_id: d.customerServiceId,
  };
}

/** `YYYY-MM-DD` -> `Date` a medianoche UTC, como Prisma escribe una columna `@db.Date`. */
export function dateColumn(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}
