'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { DESTINATION_SELECT, destinationLabel } from '@/features/Warehouses/lib/labels';
import type { StockDestinationTypeValue } from '@/features/Warehouses/schemas/stock-movement';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { orderedByLine, remainingOf } from '../lib/order-progress';
import { maskAmount } from '../lib/price-visibility';
import { canViewPurchasePrices } from '../lib/price-visibility.server';
import {
  ORDERABLE_REQUEST_STATUSES,
  canApplyPurchaseRequestAction,
  canCopyPurchaseRequest,
  type PurchaseRequestStatus,
} from '../lib/request-state-machine';

function isOrderableRequest(status: PurchaseRequestStatus): boolean {
  const orderable: readonly PurchaseRequestStatus[] = ORDERABLE_REQUEST_STATUSES;
  return orderable.includes(status);
}

/** Solicitudes de compra de un pedido de Almacenes, para su detalle. */
export async function getPurchaseRequestsForMaterialRequest(materialRequestId: string) {
  if (!isUuid(materialRequestId)) return [];
  const [canView, canViewAll, profile] = await Promise.all([
    checkPermissionServer('compras', 'solicitudes', 'view'),
    checkPermissionServer('compras', 'solicitudes', 'view_all_requests'),
    getServerAuthProfile(),
  ]);
  if (!canView || !profile) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.purchase_requests.findMany({
    // Con solo `view`, nada mas las propias (mismo criterio que la tabla y el detalle).
    where: {
      company_id: companyId,
      material_request_id: materialRequestId,
      ...(canViewAll ? {} : { requested_by: profile.id }),
    },
    select: { id: true, number: true, status: true },
    orderBy: { created_at: 'asc' },
  });
  return rows.map((r) => ({ ...r, status: r.status as PurchaseRequestStatus }));
}

// ── Lecturas ────────────────────────────────────────────────────────────────

/** Detalle de una solicitud. Con solo `view`, nada mas las propias. */
export async function getPurchaseRequestDetail(id: string) {
  if (!isUuid(id)) return null;
  const [
    canView,
    canViewAll,
    canCreate,
    canUpdate,
    canApprove,
    canCreateQuote,
    canCreateOrder,
    canViewOrders,
    canViewPrices,
    profile,
  ] = await Promise.all([
    checkPermissionServer('compras', 'solicitudes', 'view'),
    checkPermissionServer('compras', 'solicitudes', 'view_all_requests'),
    checkPermissionServer('compras', 'solicitudes', 'create'),
    checkPermissionServer('compras', 'solicitudes', 'update'),
    checkPermissionServer('compras', 'solicitudes', 'approve'),
    checkPermissionServer('compras', 'cotizaciones', 'create'),
    checkPermissionServer('compras', 'ordenes', 'create'),
    checkPermissionServer('compras', 'ordenes', 'view'),
    canViewPurchasePrices('solicitudes'),
    getServerAuthProfile(),
  ]);
  if (!canView || !profile) return null;
  const companyId = await getActiveCompanyId();

  const request = await prisma.purchase_requests.findFirst({
    where: { id, company_id: companyId, ...(canViewAll ? {} : { requested_by: profile.id }) },
    select: {
      id: true,
      number: true,
      status: true,
      needed_by: true,
      notes: true,
      created_at: true,
      submitted_at: true,
      decided_at: true,
      decision_notes: true,
      cancelled_at: true,
      cancel_reason: true,
      closed_at: true,
      close_reason: true,
      requested_by: true,
      requester: { select: { fullname: true, email: true } },
      decider: { select: { fullname: true, email: true } },
      canceller: { select: { fullname: true, email: true } },
      closer: { select: { fullname: true, email: true } },
      material_request: { select: { id: true, number: true } },
      ...DESTINATION_SELECT,
      employee_id: true,
      vehicle_id: true,
      other_equipment_id: true,
      maintenance_order_id: true,
      customer_id: true,
      customer_service_id: true,
      lines: {
        select: {
          id: true,
          material_id: true,
          description: true,
          quantity: true,
          unit_id: true,
          notes: true,
          material: { select: { id: true, code: true, name: true } },
          unit: { select: { abbreviation: true } },
          suggested_supplier: { select: { id: true, name: true } },
        },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!request) return null;

  const orderedByRequestLine = await orderedByLine(
    prisma,
    request.lines.map((l) => l.id)
  );

  // OC que cubren alguna linea (las anuladas tambien: quedan como historia).
  const orders = canViewOrders
    ? await prisma.purchase_orders.findMany({
        where: { company_id: companyId, lines: { some: { request_line: { request_id: request.id } } } },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          created_at: true,
          supplier: { select: { name: true } },
        },
        orderBy: { created_at: 'asc' },
      })
    : [];

  const userName = (p: { fullname: string | null; email: string | null } | null) =>
    p ? p.fullname ?? p.email ?? 'Usuario' : null;
  const status = request.status as PurchaseRequestStatus;
  const isRequester = request.requested_by === profile.id;
  const at = (d: Date | null) => d?.toISOString() ?? null;
  // Anotado: en un objeto literal el '' se ensancharia a string y no encajaria en el form.
  const formDestinationType: StockDestinationTypeValue | '' = request.destination_type ?? '';

  return {
    id: request.id,
    number: request.number,
    status,
    neededBy: request.needed_by ? request.needed_by.toISOString().slice(0, 10) : null,
    notes: request.notes,
    requester: userName(request.requester),
    destination: destinationLabel(request),
    destinationType: request.destination_type,
    materialRequest: request.material_request,
    form: {
      destinationType: formDestinationType,
      employeeId: request.employee_id ?? '',
      vehicleId: request.vehicle_id ?? '',
      otherEquipmentId: request.other_equipment_id ?? '',
      maintenanceOrderId: request.maintenance_order_id ?? '',
      customerId: request.customer_id ?? '',
      customerServiceId: request.customer_service_id ?? '',
    },
    lines: request.lines.map((l) => ({
      id: l.id,
      materialId: l.material_id,
      material: l.material,
      description: l.description,
      quantity: l.quantity.toString(),
      unitId: l.unit_id,
      unit: l.unit.abbreviation,
      notes: l.notes,
      suggestedSupplier: l.suggested_supplier,
      ordered: orderedByRequestLine.get(l.id) ?? '0',
      remaining: remainingOf(l.quantity.toString(), orderedByRequestLine.get(l.id) ?? '0'),
    })),
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      supplierName: o.supplier.name,
      // Sin `solicitudes:view_prices` el total no viaja (la UI muestra "Sin permiso").
      total: maskAmount(o.total.toFixed(2), canViewPrices),
    })),
    canViewPrices,
    history: [
      { event: 'Creada', at: at(request.created_at), by: userName(request.requester) },
      ...(request.submitted_at
        ? [{ event: 'Enviada a aprobación', at: at(request.submitted_at), by: userName(request.requester) }]
        : []),
      ...(request.decided_at
        ? [
            {
              event: status === 'REJECTED' ? 'Rechazada' : 'Aprobada',
              at: at(request.decided_at),
              by: userName(request.decider),
              notes: request.decision_notes,
            },
          ]
        : []),
      ...(request.cancelled_at
        ? [
            {
              event: 'Anulada',
              at: at(request.cancelled_at),
              by: userName(request.canceller),
              notes: request.cancel_reason,
            },
          ]
        : []),
      ...(request.closed_at
        ? [{ event: 'Cerrada', at: at(request.closed_at), by: userName(request.closer), notes: request.close_reason }]
        : []),
    ],
    can: {
      edit: canApplyPurchaseRequestAction(status, 'edit') && (isRequester || canUpdate),
      submit: canApplyPurchaseRequestAction(status, 'submit') && isRequester,
      approve: canApplyPurchaseRequestAction(status, 'approve') && canApprove,
      cancel: canApplyPurchaseRequestAction(status, 'cancel') && (isRequester || canUpdate),
      copy: canCopyPurchaseRequest(status) && canCreate,
      close: canApplyPurchaseRequestAction(status, 'close') && canUpdate,
      requestQuote: isOrderableRequest(status) && canCreateQuote,
      createOrder: isOrderableRequest(status) && canCreateOrder,
    },
  };
}

/**
 * Materiales activos para las lineas de la solicitud. No reusa la busqueda de Almacenes, que
 * exige permisos de Almacenes y ofrece inactivos: quien pide una compra no necesita ver el stock.
 */
export async function searchPurchaseMaterialOptions(query: string) {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return { items: [], total: 0 };
  const companyId = await getActiveCompanyId();
  const term = query.trim();
  const where = {
    company_id: companyId,
    is_active: true,
    ...(term
      ? {
          OR: [
            { code: { contains: term, mode: 'insensitive' as const } },
            { name: { contains: term, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.materials.findMany({
      where,
      select: { id: true, code: true, name: true, unit: { select: { id: true, abbreviation: true } } },
      orderBy: { name: 'asc' },
      take: 30,
    }),
    prisma.materials.count({ where }),
  ]);
  return {
    items: rows.map((m) => ({
      id: m.id,
      label: `${m.code} · ${m.name}`,
      code: m.code,
      name: m.name,
      unitId: m.unit.id,
      unit: m.unit.abbreviation,
    })),
    total,
  };
}

/** Unidades activas, para las lineas de texto libre. */
export async function getPurchaseRequestFormLookups() {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'create'))) return { units: [] };
  const companyId = await getActiveCompanyId();
  const units = await prisma.measurement_units.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true, name: true, abbreviation: true },
    orderBy: { name: 'asc' },
  });
  return { units };
}
