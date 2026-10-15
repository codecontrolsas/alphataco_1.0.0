import 'server-only';

import { argentinaDate } from '@/features/Jobs/lib/dates';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { supplierCheckDebtSql } from '@/features/Treasury/lib/rejected-checks';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { openInvoicePendingMap } from './payment-balances';
import { purchaseRequestScopeConditions, resolvePurchaseRequestScope } from './request-scope';

/**
 * Contadores de la sub-navegación de Compras. Cada función va envuelta en `React.cache` (sin
 * argumentos) para que, dentro de un mismo request, la sección activa y su contador no repitan la
 * consulta. Cada una exige el permiso de la acción que resuelve lo que cuenta.
 * `null` = no se pudo calcular o no corresponde mostrarlo: la UI muestra "—", nunca un 0 inventado.
 */

/**
 * Solicitudes = pendientes de aprobación. Misma visibilidad que la lista: sin `view_all_requests`
 * solo cuenta las propias.
 */
export const getRequestsSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('compras', 'solicitudes', 'approve'))) return null;
  const scope = await resolvePurchaseRequestScope();
  if (!scope) return null;
  return prisma.purchase_requests.count({
    where: { AND: [...purchaseRequestScopeConditions(scope), { status: 'PENDING_APPROVAL' }] },
  });
});

/** Órdenes de compra = pendientes de aprobación. */
export const getOrdersSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('compras', 'ordenes', 'approve'))) return null;
  return prisma.purchase_orders.count({
    where: { company_id: await getActiveCompanyId(), status: 'PENDING_APPROVAL' },
  });
});

/** Recepciones = órdenes de compra enviadas o recibidas en parte (lo que falta recibir). */
export const getReceiptsSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('compras', 'recepciones', 'create'))) return null;
  return prisma.purchase_orders.count({
    where: { company_id: await getActiveCompanyId(), status: { in: ['SENT', 'PARTIALLY_RECEIVED'] } },
  });
});

/**
 * Facturas = comprobantes observados. Es el mismo `where` que la lista filtrada por estado Observada y que la
 * banda de atención de la tabla (que reutiliza este contador).
 */
export const getInvoicesSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('compras', 'facturas', 'approve'))) return null;
  return prisma.supplier_invoices.count({
    where: { company_id: await getActiveCompanyId(), status: 'OBSERVED' },
  });
});

/**
 * Pagos = vencimientos a hoy (hoy en horario de Argentina): comprobantes a pagar vencidos con saldo MÁS deudas por
 * cheques rechazados vencidas. Es el `where` de la tabla de vencimientos filtrada por Días = Vencido y de su banda
 * de atención: usa la misma definición de pendiente (`openInvoicePendingMap`, `supplierCheckDebtSql`) y el mismo
 * criterio de "vencido" (comprobante: `due_date < hoy`; cheque: fecha de rechazo < hoy).
 */
export const getPaymentsSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('compras', 'pagos', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const today = argentinaDate();
  const pendingMap = await openInvoicePendingMap(prisma, companyId);
  const ids = [...pendingMap.keys()];

  const [invoices, checkDebts] = await Promise.all([
    ids.length === 0
      ? 0
      : prisma.supplier_invoices.count({
          where: { company_id: companyId, id: { in: ids }, due_date: { lt: new Date(`${today}T00:00:00.000Z`) } },
        }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM (${supplierCheckDebtSql(Prisma.sql`c.company_id = ${companyId}::uuid`, null)}) d
      JOIN suppliers s ON s.id = d.supplier_id
      WHERE d.pending::numeric > 0 AND d.rejected_on < ${today}`,
  ]);
  return invoices + Number(checkDebts[0]?.count ?? 0);
});

/** Órdenes de pago por aprobar = pendientes de aprobación (`pagos:approve`). */
export const getPaymentOrdersToApproveCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('compras', 'pagos', 'approve'))) return null;
  return prisma.payment_orders.count({
    where: { company_id: await getActiveCompanyId(), status: 'PENDING_APPROVAL' },
  });
});

/** Órdenes de pago por pagar = aprobadas sin pagar (`pagos:update`, el permiso de registrar el pago). */
export const getPaymentOrdersToPayCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return null;
  return prisma.payment_orders.count({
    where: { company_id: await getActiveCompanyId(), status: 'APPROVED' },
  });
});
