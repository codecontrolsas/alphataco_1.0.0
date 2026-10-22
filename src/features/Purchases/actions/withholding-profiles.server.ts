'use server';

import { revalidatePath } from 'next/cache';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { PurchaseError } from '../lib/purchase-errors';
import { trimDecimals } from '../lib/quantity-format';
import {
  WITHHOLDING_TAXES,
  withholdingProfilesFormSchema,
  type WithholdingProfilesFormValues,
} from '../schemas/payment-settings';

/** Situacion impositiva del proveedor frente a cada retencion (spec Compras etapa 5 §2.3). */

const logger = new Logger('features/Purchases/withholding-profiles');

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const pct = (d: Prisma.Decimal | null) => (d === null ? null : trimDecimals(d.toFixed(4)));

export async function getSupplierWithholdingProfiles(supplierId: string) {
  if (!UUID_RE.test(supplierId)) return [];
  const allowed = await Promise.all([
    checkPermissionServer('compras', 'proveedores', 'view'),
    checkPermissionServer('compras', 'pagos', 'view'),
  ]);
  if (!allowed.some(Boolean)) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.supplier_withholding_profiles.findMany({
    where: { supplier_id: supplierId, supplier: { company_id: companyId } },
    select: {
      tax: true,
      status: true,
      regime_id: true,
      rate: true,
      exclusion_percentage: true,
      exclusion_from: true,
      exclusion_to: true,
      exclusion_certificate: true,
      regime: { select: { code: true, description: true } },
    },
  });
  return rows
    .sort((a, b) => WITHHOLDING_TAXES.indexOf(a.tax) - WITHHOLDING_TAXES.indexOf(b.tax))
    .map((r) => ({
      tax: r.tax,
      status: r.status,
      regimeId: r.regime_id,
      regime: r.regime,
      rate: pct(r.rate),
      exclusion: r.exclusion_percentage
        ? { percentage: pct(r.exclusion_percentage)!, from: isoDay(r.exclusion_from)!, to: isoDay(r.exclusion_to)!, certificate: r.exclusion_certificate }
        : null,
    }));
}

export type SupplierWithholdingProfile = Awaited<ReturnType<typeof getSupplierWithholdingProfiles>>[number];

/** Guarda los cuatro impuestos de una vez: "No aplica" borra el perfil de ese impuesto. */
export async function saveSupplierWithholdingProfiles(supplierId: string, values: WithholdingProfilesFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'proveedores', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(supplierId)) return fail('El proveedor no existe');
  const parsed = withholdingProfilesFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    await prisma.$transaction(async (tx) => {
      const supplier = await tx.suppliers.findFirst({ where: { id: supplierId, company_id: companyId }, select: { id: true } });
      if (!supplier) throw new PurchaseError('El proveedor no existe');
      for (const tax of WITHHOLDING_TAXES) {
        const p = parsed.data.profiles[tax];
        if (p.status === 'NONE') {
          await tx.supplier_withholding_profiles.deleteMany({ where: { supplier_id: supplierId, tax } });
          continue;
        }
        if (p.regimeId) {
          const regime = UUID_RE.test(p.regimeId)
            ? await tx.withholding_regimes.findFirst({ where: { id: p.regimeId, company_id: companyId, tax }, select: { id: true } })
            : null;
          if (!regime) throw new PurchaseError('El régimen no existe o no es de ese impuesto');
        }
        const exclusion = p.status !== 'EXEMPT' && p.exclusionPercentage;
        const data = {
          status: p.status,
          regime_id: p.regimeId || null,
          rate: p.rate ? new Prisma.Decimal(p.rate.replace(',', '.')) : null,
          exclusion_percentage: exclusion ? new Prisma.Decimal(p.exclusionPercentage.replace(',', '.')) : null,
          exclusion_from: exclusion ? new Date(`${p.exclusionFrom}T00:00:00.000Z`) : null,
          exclusion_to: exclusion ? new Date(`${p.exclusionTo}T00:00:00.000Z`) : null,
          exclusion_certificate: exclusion ? p.exclusionCertificate || null : null,
        };
        await tx.supplier_withholding_profiles.upsert({
          where: { supplier_id_tax: { supplier_id: supplierId, tax } },
          create: { supplier_id: supplierId, tax, ...data },
          update: data,
        });
      }
    });
    revalidatePath('/dashboard/purchases', 'layout');
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'guardar la situación impositiva');
  }
}
