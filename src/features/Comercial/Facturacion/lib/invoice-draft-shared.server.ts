import 'server-only';

import { checkPermissionServer } from '@/features/Permissions';
import type { Prisma } from '@/generated/prisma/client';
import { computeInvoiceTotals } from './invoice-math';

/**
 * Piezas compartidas por las acciones de borradores (`invoice-drafts-create.server.ts` y
 * `invoice-drafts-edit.server.ts`). Sin directiva `'use server'`: no son acciones, y un archivo de
 * acciones solo puede exportar funciones async.
 */

export const COMERCIAL_PATH = '/dashboard/comercial';

/** Devuelve el mensaje de rechazo si falta el permiso de Facturación, o `null` si puede seguir. */
export async function denyUnless(action: 'create' | 'delete'): Promise<string | null> {
  const allowed = await checkPermissionServer('comercial', 'facturacion', action);
  return allowed ? null : 'No tenés permiso para esta acción en Facturación';
}

export type LineRow = {
  position: number;
  description: string;
  quantity: string;
  unit_price: string;
  net_amount: string;
  vat_rate_id: number | null;
  service_item_id: string | null;
  certification_id: string | null;
};

/** Escribe líneas, desglose de IVA y totales de un borrador (dentro de una transacción). */
export async function writeLinesAndTotals(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  letter: 'A' | 'B' | 'C',
  lines: LineRow[]
) {
  // En C no se discrimina IVA: la línea no lleva alícuota.
  const normalized = lines.map((l) => ({ ...l, vat_rate_id: letter === 'C' ? null : l.vat_rate_id }));
  const totals = computeInvoiceTotals(
    normalized.map((l) => ({ netAmount: l.net_amount, vatRateId: l.vat_rate_id })),
    letter
  );

  await tx.invoice_lines.deleteMany({ where: { invoice_id: invoiceId } });
  await tx.invoice_vat.deleteMany({ where: { invoice_id: invoiceId } });
  if (normalized.length > 0) {
    await tx.invoice_lines.createMany({ data: normalized.map((l) => ({ ...l, invoice_id: invoiceId })) });
  }
  if (totals.vatBreakdown.length > 0) {
    await tx.invoice_vat.createMany({
      data: totals.vatBreakdown.map((v) => ({
        invoice_id: invoiceId,
        vat_rate_id: v.vatRateId,
        base_amount: v.base,
        vat_amount: v.amount,
      })),
    });
  }
  await tx.invoices.update({
    where: { id: invoiceId },
    data: {
      net_taxed: totals.netTaxed,
      net_untaxed: totals.netUntaxed,
      exempt_amount: totals.exempt,
      other_taxes: totals.otherTaxes,
      vat_total: totals.vatTotal,
      total: totals.total,
    },
  });
  return totals;
}
