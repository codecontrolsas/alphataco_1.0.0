'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { lockRequest } from '@/features/Warehouses/lib/requests';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import {
  NO_PERMISSION,
  PURCHASES_PATH,
  SESSION_EXPIRED,
  firstIssue,
  toPurchaseActionError,
} from '../lib/action-errors';
import { notifyRequestDecision, notifyRequestSubmitted } from '../lib/approval-notifications.server';
import { materialRequestShortfall, type MaterialRequestShortfall } from '../lib/from-material-request';
import { PurchaseError } from '../lib/purchase-errors';
import { nextPurchaseRequestNumber } from '../lib/request-numbering';
import { canCopyPurchaseRequest, purchaseRequestStatusAfter } from '../lib/request-state-machine';
import {
  dateColumn,
  destinationColumns,
  lockPurchaseRequest,
  validatePurchaseRequestInput,
  type ValidatedLine,
} from '../lib/requests';
import {
  decisionNotesSchema,
  purchaseRequestFormSchema,
  requiredReasonSchema,
  toPurchaseRequestInput,
  type PurchaseRequestFormValues,
  type PurchaseRequestInput,
} from '../schemas/requests';

const logger = new Logger('features/Purchases/requests');

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function revalidate(requestId?: string) {
  revalidatePath(PURCHASES_PATH);
  if (requestId) revalidatePath(`${PURCHASES_PATH}/requests/${requestId}`);
}

async function writeLines(tx: Tx, requestId: string, lines: ValidatedLine[]) {
  await tx.purchase_request_lines.createMany({
    data: lines.map((line, i) => ({ ...line, request_id: requestId, position: i + 1 })),
  });
}

/** Alta de una solicitud ya validada (la usan el alta comun y la que sale de un pedido). */
async function insertPurchaseRequest(
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

/** Crea la solicitud como borrador o directamente pendiente de aprobacion. */
export async function createPurchaseRequest(
  values: PurchaseRequestFormValues,
  options: { submit: boolean }
): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return fail(NO_PERMISSION);
  const parsed = purchaseRequestFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    const created = await prisma.$transaction((tx) =>
      insertPurchaseRequest(tx, companyId, profile.id, toPurchaseRequestInput(parsed.data), {
        submit: options.submit,
        materialRequestId: null,
      })
    );
    logger.info('Solicitud de compra creada', { data: { number: created.number, submit: options.submit } });
    // «Crear y enviar» la deja esperando aprobación sin pasar por `submitPurchaseRequest`: también avisa.
    if (options.submit) await notifyRequestSubmitted(created.id, companyId, profile.fullname, new Date());
    revalidate();
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear la solicitud');
  }
}

/** Edita un borrador: el solicitante, o quien tenga `update`. Las lineas se reescriben. */
export async function updatePurchaseRequestDraft(id: string, values: PurchaseRequestFormValues): Promise<ActionResult> {
  if (!isUuid(id)) return fail('La solicitud no existe');
  const parsed = purchaseRequestFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const [companyId, canUpdate, canCreate] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('compras', 'solicitudes', 'update'),
    checkPermissionServer('compras', 'solicitudes', 'create'),
  ]);

  try {
    await prisma.$transaction(async (tx) => {
      const request = await lockPurchaseRequest(tx, companyId, id, 'edit');
      // El solicitante necesita `create`; quien no lo es, `update`.
      if (!(request.requestedBy === profile.id ? canCreate : canUpdate)) throw new PurchaseError(NO_PERMISSION);
      const input = await constrainToMaterialRequest(tx, id, toPurchaseRequestInput(parsed.data));
      const lines = await validatePurchaseRequestInput(tx, companyId, input);
      await tx.purchase_requests.update({
        where: { id },
        data: { needed_by: dateColumn(input.neededBy), notes: input.notes, ...destinationColumns(input) },
      });
      // Es el mismo borrador, no una relacion con historia: las lineas se reescriben enteras.
      await tx.purchase_request_lines.deleteMany({ where: { request_id: id } });
      await writeLines(tx, id, lines);
    });
    revalidate(id);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'guardar la solicitud');
  }
}

/**
 * Un borrador generado desde un pedido de Almacenes sigue atado al pedido al editarlo: conserva
 * el destino del pedido (el del formulario se ignora) y solo admite materiales del pedido.
 */
async function constrainToMaterialRequest(
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
async function inputFromStored(tx: Tx, requestId: string): Promise<PurchaseRequestInput> {
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

/** Envia el borrador a aprobacion. Revalida todo: el borrador pudo quedar invalido mientras esperaba. */
export async function submitPurchaseRequest(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La solicitud no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const submittedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const request = await lockPurchaseRequest(tx, companyId, id, 'submit');
      if (request.requestedBy !== profile.id) throw new PurchaseError('Solo quien pidió la solicitud la puede enviar');
      await validatePurchaseRequestInput(tx, companyId, await inputFromStored(tx, id));
      await tx.purchase_requests.update({
        where: { id },
        data: { status: purchaseRequestStatusAfter('submit'), submitted_at: submittedAt },
      });
    });
    await notifyRequestSubmitted(id, companyId, profile.fullname, submittedAt);
    revalidate(id);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'enviar la solicitud');
  }
}

async function decide(id: string, approved: boolean, rawNotes: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'approve'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La solicitud no existe');
  const notes = (approved ? decisionNotesSchema : requiredReasonSchema).safeParse(rawNotes);
  if (!notes.success) return fail(firstIssue(notes.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const action = approved ? 'approve' : 'reject';
  const decidedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseRequest(tx, companyId, id, action);
      await tx.purchase_requests.update({
        where: { id },
        data: {
          status: purchaseRequestStatusAfter(action),
          decided_by: profile.id,
          decided_at: decidedAt,
          decision_notes: notes.data || null,
        },
      });
    });
  } catch (error) {
    return toPurchaseActionError(error, logger, approved ? 'aprobar la solicitud' : 'rechazar la solicitud');
  }
  await notifyRequestDecision(id, companyId, approved, notes.data || null, decidedAt);
  revalidate(id);
  return ok(null);
}

export async function approvePurchaseRequest(id: string, notes = ''): Promise<ActionResult> {
  return decide(id, true, notes);
}

export async function rejectPurchaseRequest(id: string, reason: string): Promise<ActionResult> {
  return decide(id, false, reason);
}

/** Anula un borrador o una pendiente: el solicitante, o quien tenga `update`. */
export async function cancelPurchaseRequest(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return fail('La solicitud no existe');
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const [companyId, canUpdate, canCreate] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('compras', 'solicitudes', 'update'),
    checkPermissionServer('compras', 'solicitudes', 'create'),
  ]);
  try {
    await prisma.$transaction(async (tx) => {
      const request = await lockPurchaseRequest(tx, companyId, id, 'cancel');
      // El solicitante necesita `create`; quien no lo es, `update`.
      if (!(request.requestedBy === profile.id ? canCreate : canUpdate)) throw new PurchaseError(NO_PERMISSION);
      await tx.purchase_requests.update({
        where: { id },
        data: {
          status: purchaseRequestStatusAfter('cancel'),
          cancelled_by: profile.id,
          cancelled_at: new Date(),
          cancel_reason: motive.data,
        },
      });
    });
    revalidate(id);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'anular la solicitud');
  }
}

/**
 * Cierra una solicitud aprobada o pedida en parte sin comprar lo que falta (con motivo). Lo ya
 * pedido en OC sigue su curso; la solicitud deja de ofrecerse para cotizar y pedir.
 */
export async function closePurchaseRequest(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La solicitud no existe');
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseRequest(tx, companyId, id, 'close');
      await tx.purchase_requests.update({
        where: { id },
        data: {
          status: purchaseRequestStatusAfter('close'),
          closed_by: profile.id,
          closed_at: new Date(),
          close_reason: motive.data,
        },
      });
    });
    revalidate(id);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'cerrar la solicitud');
  }
}

/** Copia una rechazada o anulada como un borrador nuevo del usuario actual. */
export async function copyPurchaseRequest(id: string): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La solicitud no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const [companyId, canViewAll] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('compras', 'solicitudes', 'view_all_requests'),
  ]);
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Solo se copia lo que se puede ver: la propia, o cualquiera con `view_all_requests`.
      const source = await tx.purchase_requests.findFirst({
        where: { id, company_id: companyId, ...(canViewAll ? {} : { requested_by: profile.id }) },
        select: { status: true, number: true, material_request_id: true },
      });
      if (!source) throw new PurchaseError('La solicitud no existe');
      if (!canCopyPurchaseRequest(source.status)) {
        throw new PurchaseError(`La solicitud ${source.number} no se copia: solo rechazadas o anuladas`);
      }
      // La copia se valida como cualquier alta: si algo quedo inactivo, se avisa ahora.
      return insertPurchaseRequest(tx, companyId, profile.id, await inputFromStored(tx, id), {
        submit: false,
        materialRequestId: source.material_request_id,
      });
    });
    revalidate();
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'copiar la solicitud');
  }
}

// ── Desde un pedido de materiales de Almacenes ──────────────────────────────

/**
 * Mismo criterio de visibilidad que el detalle del pedido en Almacenes: `almacenes:pedidos:view`
 * y, sin `view_all_requests`, solo los pedidos propios. Sin esto, quien puede crear solicitudes de
 * compra veria (y colgaria compras de) pedidos ajenos con solo conocer su uuid.
 */
async function assertMaterialRequestVisible(materialRequestId: string, profileId: string, companyId: string) {
  const [canView, canViewAll] = await Promise.all([
    checkPermissionServer('almacenes', 'pedidos', 'view'),
    checkPermissionServer('almacenes', 'pedidos', 'view_all_requests'),
  ]);
  const request = canView
    ? await prisma.material_requests.findFirst({
        where: { id: materialRequestId, company_id: companyId, ...(canViewAll ? {} : { requested_by: profileId }) },
        select: { id: true },
      })
    : null;
  if (!request) throw new PurchaseError('El pedido de materiales no existe');
}

/** Faltante del pedido para precargar la solicitud (pendiente de entrega - stock de la empresa). */
export async function getMaterialRequestShortfall(
  materialRequestId: string
): Promise<ActionResult<MaterialRequestShortfall>> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return fail(NO_PERMISSION);
  if (!isUuid(materialRequestId)) return fail('El pedido de materiales no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await assertMaterialRequestVisible(materialRequestId, profile.id, companyId);
    return ok(await materialRequestShortfall(prisma, companyId, materialRequestId));
  } catch (error) {
    return toPurchaseActionError(error, logger, 'calcular el faltante del pedido');
  }
}

/**
 * Crea la solicitud vinculada al pedido. El destino es SIEMPRE el del pedido (el del formulario
 * se ignora) y cada linea tiene que ser un material del pedido; las cantidades las ajusta el
 * usuario. Se permiten varias solicitudes por pedido (por ejemplo, una por proveedor).
 */
export async function createPurchaseRequestFromMaterialRequest(
  materialRequestId: string,
  values: PurchaseRequestFormValues,
  options: { submit: boolean }
): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return fail(NO_PERMISSION);
  if (!isUuid(materialRequestId)) return fail('El pedido de materiales no existe');
  const parsed = purchaseRequestFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    await assertMaterialRequestVisible(materialRequestId, profile.id, companyId);
    const created = await prisma.$transaction(async (tx) => {
      // El pedido se lockea: una entrega simultanea no cambia el faltante a mitad de camino.
      await lockRequest(tx, companyId, materialRequestId);
      const shortfall = await materialRequestShortfall(tx, companyId, materialRequestId);
      const pedidoMaterials = new Set(
        (
          await tx.material_request_lines.findMany({
            where: { request_id: materialRequestId },
            select: { material_id: true },
          })
        ).map((l) => l.material_id)
      );
      const input = toPurchaseRequestInput(parsed.data);
      input.lines.forEach((line, i) => {
        if (!line.materialId || !pedidoMaterials.has(line.materialId)) {
          throw new PurchaseError(`Línea ${i + 1}: solo se piden materiales del pedido ${shortfall.number}`);
        }
      });
      return insertPurchaseRequest(
        tx,
        companyId,
        profile.id,
        { ...input, destination: shortfall.destination },
        { submit: options.submit, materialRequestId }
      );
    });
    logger.info('Solicitud de compra creada desde un pedido', { data: { number: created.number, materialRequestId } });
    if (options.submit) await notifyRequestSubmitted(created.id, companyId, profile.fullname, new Date());
    revalidate();
    revalidatePath(`/dashboard/warehouse/requests/${materialRequestId}`);
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear la solicitud');
  }
}
