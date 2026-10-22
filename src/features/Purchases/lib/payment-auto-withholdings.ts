import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import type { withholding_status, withholding_tax } from '@/generated/prisma/enums';
import { WITHHOLDING_TAXES } from '../schemas/payment-settings';
import { computeWithholding, type WithholdingRegime, type WithholdingResult } from './withholdings';

/** Retenciones automaticas de una orden de pago: lo que calcula el motor segun el perfil del proveedor. */
type Tx = Prisma.TransactionClient;

const decimalToText = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());

/** Ganancias: bases y retenciones de las ordenes pagadas del proveedor en el mes de `date`. */
async function gananciasMonth(
  tx: Pick<Tx, '$queryRaw'>,
  supplierId: string,
  date: string,
  excludeOrderId: string | null
) {
  const rows = await tx.$queryRaw<{ base: string | null; withheld: string | null }[]>`
    SELECT (SELECT SUM(o.withholding_net_base) FROM payment_orders o
             WHERE o.supplier_id = ${supplierId}::uuid AND o.status = 'PAID'
               AND date_trunc('month', o.paid_on) = date_trunc('month', ${date}::date)
               AND (${excludeOrderId}::uuid IS NULL OR o.id <> ${excludeOrderId}::uuid))::text AS base,
           (SELECT SUM(w.amount) FROM payment_order_withholdings w JOIN payment_orders o ON o.id = w.payment_order_id
             WHERE o.supplier_id = ${supplierId}::uuid AND o.status = 'PAID' AND w.tax = 'GANANCIAS' AND w.cancelled_at IS NULL
               AND date_trunc('month', o.paid_on) = date_trunc('month', ${date}::date)
               AND (${excludeOrderId}::uuid IS NULL OR o.id <> ${excludeOrderId}::uuid))::text AS withheld
  `;
  return { previousBase: rows[0]?.base ?? '0', previousWithheld: rows[0]?.withheld ?? '0' };
}

export type AutomaticWithholding = {
  regime: WithholdingRegime | null;
  computed: WithholdingResult | null;
  supplierStatus: withholding_status | null;
};

/**
 * Retenciones que calcula el motor (sin correcciones manuales) para un proveedor, una fecha y unas
 * bases. Lo usan el armado de la orden y la revalidacion antes de aprobar y pagar.
 */
export async function computeAutomaticWithholdings(
  tx: Tx,
  companyId: string,
  supplierId: string,
  vatConditionId: number,
  plannedOn: string,
  bases: { net: string; vat: string },
  excludeOrderId: string | null
): Promise<Map<withholding_tax, AutomaticWithholding>> {
  // Retenciones: perfiles del proveedor con su regimen; IIBB puede no tener regimen (solo padron).
  const [profiles, regimes] = await Promise.all([
    tx.supplier_withholding_profiles.findMany({ where: { supplier_id: supplierId } }),
    tx.withholding_regimes.findMany({ where: { company_id: companyId }, orderBy: { code: 'asc' } }),
  ]);
  const regimeOf = (id: string | null): WithholdingRegime | null => {
    const r = id ? regimes.find((x) => x.id === id) : undefined;
    if (!r) return null;
    return {
      id: r.id,
      code: r.code,
      description: r.description,
      rateRegistered: r.rate_registered.toString(),
      rateUnregistered: decimalToText(r.rate_unregistered),
      monthlyExemptAmount: r.monthly_exempt_amount.toString(),
      minimumWithholding: r.minimum_withholding.toString(),
      scale: Array.isArray(r.scale) ? (r.scale as WithholdingRegime['scale']) : null,
      vatPercentage: decimalToText(r.vat_percentage),
      isActive: r.is_active,
    };
  };

  const month = await gananciasMonth(tx, supplierId, plannedOn, excludeOrderId);
  const result = new Map<withholding_tax, AutomaticWithholding>();
  for (const tax of WITHHOLDING_TAXES) {
    const p = profiles.find((x) => x.tax === tax);
    // IIBB sin regimen: alicuota de padron con un regimen "virtual" no se admite: hace falta un
    // regimen para el codigo del archivo. Se usa el primero activo de IIBB.
    const regime = regimeOf(
      p?.regime_id ?? (tax === 'IIBB' ? regimes.find((r) => r.tax === 'IIBB' && r.is_active)?.id ?? null : null)
    );
    const computed = computeWithholding({
      tax,
      date: plannedOn,
      regime,
      profile: p
        ? {
            status: p.status,
            rate: decimalToText(p.rate),
            exclusion:
              p.exclusion_percentage && p.exclusion_from && p.exclusion_to
                ? {
                    percentage: p.exclusion_percentage.toString(),
                    from: p.exclusion_from.toISOString().slice(0, 10),
                    to: p.exclusion_to.toISOString().slice(0, 10),
                  }
                : null,
          }
        : null,
      netBase: bases.net,
      vatBase: bases.vat,
      supplierIsRegistered: vatConditionId === 1,
      month,
    });
    result.set(tax, { regime, computed, supplierStatus: p?.status ?? null });
  }
  return result;
}
