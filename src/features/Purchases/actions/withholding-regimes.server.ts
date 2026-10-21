'use server';

import { revalidatePath } from 'next/cache';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { cents, money } from '../lib/payment-totals';
import { trimDecimals } from '../lib/quantity-format';
import {
  WITHHOLDING_TAXES,
  WITHHOLDING_TAX_LABELS,
  withholdingRegimeFormSchema,
  type WithholdingRegimeFormValues,
} from '../schemas/payment-settings';

/** Regimenes de retencion de la empresa (spec Compras etapa 5 §2.3). */

const logger = new Logger('features/Purchases/withholding-regimes');

const PURCHASES_PATH = '/dashboard/purchases';
const NOT_FOUND = 'El régimen no existe';

const decimal = (value: string) => new Prisma.Decimal(value.replace(',', '.'));
const optional = (value: string) => (value.trim() ? decimal(value) : null);

type ScaleRow = { from: string; to: string | null; fixed: string; rate: string };

/** Escala normalizada (texto con punto; `to` vacio = sin tope), ordenada por `from`. */
function toScale(rows: WithholdingRegimeFormValues['scale']): ScaleRow[] | null {
  if (rows.length === 0) return null;
  return rows
    .map((row) => ({ from: money(cents(row.from)), to: row.to ? money(cents(row.to)) : null, fixed: money(cents(row.fixed)), rate: row.rate.replace(',', '.') }))
    .sort((a, b) => Number(cents(a.from) - cents(b.from)));
}

function parseScale(value: Prisma.JsonValue): ScaleRow[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const { from, to, fixed, rate } = item as Record<string, unknown>;
    if (typeof from !== 'string' || typeof fixed !== 'string' || typeof rate !== 'string') return [];
    return [{ from, to: typeof to === 'string' ? to : null, fixed, rate }];
  });
}

/** Todos los regimenes, por impuesto y codigo. */
export async function getWithholdingRegimes() {
  const allowed = await Promise.all([
    checkPermissionServer('compras', 'config-compras', 'view'),
    checkPermissionServer('compras', 'proveedores', 'view'),
    checkPermissionServer('compras', 'pagos', 'view'),
  ]);
  if (!allowed.some(Boolean)) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.withholding_regimes.findMany({
    where: { company_id: companyId },
    orderBy: [{ tax: 'asc' }, { code: 'asc' }],
  });
  const text = (d: Prisma.Decimal | null) => (d === null ? null : trimDecimals(d.toFixed(4)));
  return rows
    .sort((a, b) => WITHHOLDING_TAXES.indexOf(a.tax) - WITHHOLDING_TAXES.indexOf(b.tax) || a.code.localeCompare(b.code))
    .map((r) => ({
      id: r.id,
      tax: r.tax,
      code: r.code,
      description: r.description,
      rateRegistered: text(r.rate_registered)!,
      rateUnregistered: text(r.rate_unregistered),
      monthlyExemptAmount: r.monthly_exempt_amount.toFixed(2),
      minimumWithholding: r.minimum_withholding.toFixed(2),
      vatPercentage: text(r.vat_percentage),
      scale: parseScale(r.scale),
      is_active: r.is_active,
    }));
}

export type WithholdingRegimeRow = Awaited<ReturnType<typeof getWithholdingRegimes>>[number];

function toData(v: WithholdingRegimeFormValues) {
  const scale = toScale(v.scale);
  return {
    tax: v.tax,
    code: v.code,
    description: v.description,
    rate_registered: decimal(v.rateRegistered || '0'),
    rate_unregistered: optional(v.rateUnregistered),
    monthly_exempt_amount: decimal(v.monthlyExemptAmount || '0'),
    minimum_withholding: decimal(v.minimumWithholding || '0'),
    vat_percentage: v.tax === 'IVA' ? optional(v.vatPercentage) : null,
    scale: scale ? (scale as Prisma.InputJsonValue) : Prisma.DbNull,
  };
}

const duplicate = (v: WithholdingRegimeFormValues) => `Ya existe el régimen ${v.code} de ${WITHHOLDING_TAX_LABELS[v.tax]}`;

export async function createWithholdingRegime(values: WithholdingRegimeFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  const parsed = withholdingRegimeFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const created = await prisma.withholding_regimes.create({ data: { ...toData(parsed.data) }, select: { id: true } });
    revalidatePath(PURCHASES_PATH);
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear el régimen', duplicate(parsed.data));
  }
}

export async function updateWithholdingRegime(id: string, values: WithholdingRegimeFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  const parsed = withholdingRegimeFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.withholding_regimes.updateMany({ where: { id, company_id: companyId }, data: toData(parsed.data) });
    if (count === 0) return fail(NOT_FOUND);
    revalidatePath(PURCHASES_PATH);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'actualizar el régimen', duplicate(parsed.data));
  }
}

/** Un regimen inactivo deja de retener (las ordenes ya pagadas no cambian). */
export async function setWithholdingRegimeActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.withholding_regimes.updateMany({ where: { id, company_id: companyId }, data: { is_active: isActive } });
    if (count === 0) return fail(NOT_FOUND);
    revalidatePath(PURCHASES_PATH);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, isActive ? 'reactivar el régimen' : 'desactivar el régimen');
  }
}
