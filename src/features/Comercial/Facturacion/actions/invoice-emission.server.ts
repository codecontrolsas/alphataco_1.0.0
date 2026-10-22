'use server';

import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { getFiscalDataOverview } from '@/features/Empresa/General/FiscalData/lib/fiscal-data-overview.server';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { getArcaGateway, isArcaMockMode } from '@/shared/lib/arca/server/gateway';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import {
  issueInvoice,
  reconcileInvoice,
  validateLoadedInvoice,
  type EmissionOutcome,
  type ReconcileOutcome,
} from '../lib/emission.server';
import { loadInvoice } from '../lib/invoice-context.server';
import { canIssue } from '../lib/invoice-state-machine';
import { cbteLabel, formatVoucherNumber } from '../lib/invoice-type';
import type { IssueProblem } from '../lib/invoice-validation';
import { renderAndStoreInvoicePdf } from '../pdf/render-invoice-pdf.server';

const logger = new Logger('features/Comercial/Facturacion/emission-actions');

const COMERCIAL_PATH = '/dashboard/comercial';

/** Emitir exige `approve` y además ver los importes: no se emite lo que no se ve. */
async function canEmit(): Promise<string | null> {
  const [approve, viewPrices] = await Promise.all([
    checkPermissionServer('comercial', 'facturacion', 'approve'),
    checkPermissionServer('comercial', 'facturacion', 'view_prices'),
  ]);
  if (!approve) return 'Emitir requiere el permiso Aprobar en Facturación';
  if (!viewPrices) return 'Emitir requiere el permiso Ver precios en Facturación';
  return null;
}

/** Lo que falta para poder emitir (checklist del editor). Vacío = se puede abrir la confirmación. */
export async function validateInvoiceForIssueAction(id: string): Promise<ActionResult<{ problems: IssueProblem[] }>> {
  const canView = await checkPermissionServer('comercial', 'facturacion', 'view');
  if (!canView) return fail('No tenés permiso para ver este comprobante');
  const companyId = await getActiveCompanyId();
  const invoice = await loadInvoice(id, companyId);
  if (!invoice) return fail('Comprobante no encontrado');
  const { problems } = await validateLoadedInvoice(invoice);
  return ok({ problems });
}

/**
 * Datos para la confirmación de emisión: qué se emite, en qué ambiente y con qué número (el que
 * informa ARCA ahora; puede cambiar si alguien emite antes). Consulta a ARCA.
 */
export async function previewInvoiceIssue(id: string): Promise<
  ActionResult<{
    label: string;
    expectedNumber: string;
    environment: 'homologacion' | 'produccion';
    simulated: boolean;
    total: string;
    currency: string;
    customer: string;
  }>
> {
  const denied = await canEmit();
  if (denied) return fail(denied);
  const companyId = await getActiveCompanyId();
  try {
    const invoice = await loadInvoice(id, companyId);
    if (!invoice) return fail('Comprobante no encontrado');
    if (!canIssue(invoice.status)) return fail('Este comprobante no se puede emitir en su estado actual');
    const overview = await getFiscalDataOverview();
    const environment = invoice.associated_invoice?.environment ?? overview.environment;
    const gateway = await getArcaGateway(companyId, environment, { invoiceId: id });
    const last = await gateway.lastAuthorized(invoice.sales_point.number, invoice.cbte_type);
    return ok({
      label: cbteLabel(invoice.cbte_type),
      expectedNumber: formatVoucherNumber(invoice.sales_point.number, last + 1),
      environment,
      simulated: isArcaMockMode(),
      total: invoice.total.toFixed(2),
      currency: invoice.currency,
      customer: invoice.customer.name,
    });
  } catch (error) {
    logger.error('Error al preparar la emisión', { data: { error: errorMessage(error, ''), id } });
    return fail(errorMessage(error, 'No se pudo consultar a ARCA'));
  }
}

/**
 * Emite ante ARCA. El resultado describe lo que pasó de verdad (autorizada con CAE, rechazada con
 * los motivos, pendiente con su número). El PDF se genera después de responder.
 */
export async function issueInvoiceAction(id: string): Promise<ActionResult<EmissionOutcome>> {
  const denied = await canEmit();
  if (denied) return fail(denied);
  const companyId = await getActiveCompanyId();
  try {
    const userId = await getSessionUserId();
    const outcome = await issueInvoice(id, companyId, userId);
    if (outcome.status === 'autorizada') {
      after(async () => {
        const result = await renderAndStoreInvoicePdf(id, companyId);
        if ('error' in result)
          logger.error('No se generó el PDF tras autorizar', { data: { id, error: result.error } });
      });
    }
    revalidatePath(COMERCIAL_PATH);
    return ok(outcome);
  } catch (error) {
    logger.error('Error al emitir el comprobante', { data: { error: errorMessage(error, ''), id } });
    revalidatePath(COMERCIAL_PATH);
    return fail(errorMessage(error, 'Error al emitir el comprobante'));
  }
}

/** "Consultar estado en ARCA" de un comprobante pendiente. Nunca reintenta la emisión. */
export async function reconcileInvoiceAction(id: string): Promise<ActionResult<ReconcileOutcome>> {
  const denied = await canEmit();
  if (denied) return fail(denied);
  const companyId = await getActiveCompanyId();
  try {
    const outcome = await reconcileInvoice(id, companyId);
    if (outcome.status === 'autorizada') {
      after(async () => {
        await renderAndStoreInvoicePdf(id, companyId);
      });
    }
    revalidatePath(COMERCIAL_PATH);
    return ok(outcome);
  } catch (error) {
    logger.error('Error al consultar el comprobante en ARCA', { data: { error: errorMessage(error, ''), id } });
    return fail(errorMessage(error, 'Error al consultar en ARCA'));
  }
}

/** Vuelve a generar el PDF (si falló después de autorizar). Idempotente. */
export async function regenerateInvoicePdf(id: string): Promise<ActionResult<null>> {
  const allowed = await checkPermissionServer('comercial', 'facturacion', 'view_prices');
  if (!allowed) return fail('No tenés permiso para ver los importes de este comprobante');
  const companyId = await getActiveCompanyId();
  const result = await renderAndStoreInvoicePdf(id, companyId);
  if ('error' in result) return fail(result.error);
  revalidatePath(COMERCIAL_PATH);
  return ok(null);
}
