'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import type { arca_check_result } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { ArcaAuthError, ArcaError, ArcaServiceError, ArcaTransportError } from '@/shared/lib/arca/errors';
import { checkVoucherWithArca } from '@/shared/lib/arca/server/gateway';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, PURCHASES_PATH, SESSION_EXPIRED, toPurchaseActionError } from '../lib/action-errors';
import { parseObservations } from '../lib/invoice-observations';
import { lockSupplierInvoice } from '../lib/invoices';
import { paymentOrderOfInvoice } from '../lib/payment-locks';

const logger = new Logger('features/Purchases/invoice-arca');

const NOT_FOUND = 'El comprobante no existe';

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

const ARCA_UNAVAILABLE = 'ARCA no respondió: probá de nuevo más tarde';
const WSCDC_NOT_AUTHORIZED =
  'El certificado de la empresa no tiene habilitado el servicio Constatación de comprobantes (wscdc). Asocialo en ARCA → Administración de certificados digitales.';

/**
 * Constata el comprobante en ARCA (WSCDC, spec Compras etapa 4 §3.5). La llamada a ARCA va FUERA
 * de la transaccion; despues se guarda el resultado con el comprobante lockeado:
 * - aprobado: solo el resultado;
 * - rechazado: observacion ARCA y el comprobante pasa a OBSERVED (se borra la resolucion);
 * - sin respuesta: UNAVAILABLE y el estado no cambia.
 */
export async function checkSupplierInvoiceInArca(
  id: string
): Promise<ActionResult<{ result: arca_check_result; message: string }>> {
  if (!(await checkPermissionServer('compras', 'facturas', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  const invoice = await prisma.supplier_invoices.findFirst({
    where: { id, company_id: companyId, status: { not: 'CANCELLED' } },
    select: {
      cbte_type: true,
      sales_point: true,
      number: true,
      issue_date: true,
      total: true,
      cae: true,
      supplier: { select: { cuit: true } },
      company: { select: { company_cuit: true, fiscal_profile: { select: { environment: true } } } },
    },
  });
  if (!invoice) return fail(NOT_FOUND);
  if (!invoice.cae) return fail('Cargá el CAE del comprobante para constatarlo en ARCA');
  const env = invoice.company.fiscal_profile?.environment ?? 'homologacion';

  let outcome: { result: arca_check_result; detail: string | null; observation: string | null };
  try {
    const checked = await checkVoucherWithArca(companyId, env, {
      issuerCuit: invoice.supplier.cuit.toString(),
      salesPoint: invoice.sales_point,
      cbteType: invoice.cbte_type,
      number: Number(invoice.number),
      issueDate: invoice.issue_date.toISOString().slice(0, 10),
      total: invoice.total.toFixed(2),
      cae: invoice.cae,
      receiverCuit: invoice.company.company_cuit.replace(/\D/g, ''),
    });
    const detail = checked.observations.map((o) => `${o.code}: ${o.message}`).join(' | ') || null;
    outcome =
      checked.result === 'A'
        ? { result: 'APPROVED', detail, observation: null }
        : { result: 'REJECTED', detail, observation: `ARCA rechazó la constatación${detail ? `: ${detail}` : ''}` };
  } catch (error) {
    if (error instanceof ArcaTransportError) {
      outcome = { result: 'UNAVAILABLE', detail: error.message, observation: null };
    } else if (error instanceof ArcaAuthError && /notAuthorized/i.test(error.faultCode)) {
      return fail(WSCDC_NOT_AUTHORIZED);
    } else if (error instanceof ArcaServiceError) {
      return fail(`ARCA respondió: ${error.message}`);
    } else if (error instanceof ArcaError) {
      return fail(error.message);
    } else {
      logger.error('Error al constatar en ARCA', { data: { error, id } });
      return fail('No se pudo constatar el comprobante. Intentá de nuevo; si persiste, avisá a soporte.');
    }
  }

  try {
    await withActor(profile.credentialId, async (tx) => {
      const locked = await lockSupplierInvoice(tx, companyId, id);
      const current = await tx.supplier_invoices.findUniqueOrThrow({ where: { id }, select: { observations: true } });
      // Un rechazado sigue rechazado, y uno ya pagado en una orden no deja de estar a pagar (sacarlo
      // de la deuda descuadraria la cuenta corriente): la constatacion solo suma su observacion. En una
      // orden sin pagar si pasa a observado, y eso frena aprobarla y pagarla.
      const keepStatus =
        locked.status === 'REJECTED' || (await paymentOrderOfInvoice(tx, id, { paidOnly: true })) !== null;
      const checkData = {
        arca_check_result: outcome.result,
        arca_checked_at: new Date(),
        arca_check_detail: outcome.detail,
      };
      if (outcome.observation) {
        const observations = [
          ...parseObservations(current.observations).filter((o) => o.code !== 'ARCA'),
          { code: 'ARCA' as const, message: outcome.observation },
        ];
        await tx.supplier_invoices.update({
          where: { id },
          data: {
            ...checkData,
            observations: observations as Prisma.InputJsonValue,
            ...(keepStatus
              ? {}
              : { status: 'OBSERVED' as const, resolved_by: null, resolved_at: null, resolution_comment: null }),
          },
        });
      } else {
        await tx.supplier_invoices.update({ where: { id }, data: checkData });
      }
    });
    revalidate();
  } catch (error) {
    return toPurchaseActionError(error, logger, 'guardar la constatación');
  }

  const message =
    outcome.result === 'APPROVED'
      ? 'ARCA constató el comprobante'
      : outcome.result === 'REJECTED'
        ? `ARCA rechazó la constatación: el comprobante quedó observado${outcome.detail ? ` (${outcome.detail})` : ''}`
        : ARCA_UNAVAILABLE;
  return ok({ result: outcome.result, message });
}
