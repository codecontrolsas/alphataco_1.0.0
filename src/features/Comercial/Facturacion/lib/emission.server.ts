import { getFiscalDataOverview } from '@/features/Empresa/General/FiscalData/lib/fiscal-data-overview.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { cbteTypesOfKind } from '@/shared/lib/arca/catalogs';
import { argentinaDateOnly, fromArcaDate, toArcaDate } from '@/shared/lib/arca/dates';
import { ArcaConfigError, ArcaError, ArcaServiceError, type ArcaMessage } from '@/shared/lib/arca/errors';
import { getArcaGateway, isArcaMockMode, type ArcaGateway } from '@/shared/lib/arca/server/gateway';
import { withLease } from '@/shared/lib/arca/server/leases';
import type { CaeRequest } from '@/shared/lib/arca/wsfe';
import { toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import 'server-only';
import {
  buildIssuerSnapshot,
  buildReceiverSnapshot,
  creditableRemaining,
  loadInvoice,
  loadIssuer,
  type LoadedInvoice,
} from './invoice-context.server';
import { amountOf, compareAmounts } from './invoice-math';
import { STALE_EMITTING_MS, canIssue } from './invoice-state-machine';
import { formatVoucherLabel, kindOf, letterOf, resolveLetter, type LetterResult } from './invoice-type';
import { validateInvoiceForIssue, type IssueProblem } from './invoice-validation';
import { parseIssuerSnapshot } from './snapshots';

/**
 * Emisión de comprobantes ante ARCA. Reglas que no se negocian:
 *
 * 1. Nunca hay una llamada a ARCA dentro de una transacción (timeout de 5 s y conexión tomada).
 * 2. La numeración se serializa con un lease por (punto de venta, ambiente, tipo).
 * 3. El número se GUARDA antes de pedir el CAE: si ARCA no responde, ese número es lo que se
 *    consulta (`FECompConsultar`) para saber si quedó autorizado. Sin esto se duplicaría.
 * 4. `FECAESolicitar` no se reintenta a ciegas: un timeout deja el comprobante `pendiente` y la
 *    única salida es consultar.
 * 5. La autorización se aplica en UNA sentencia (estado + CAE + fecha), porque una vez
 *    autorizado el trigger de inmutabilidad no deja tocar nada más.
 */

const logger = new Logger('features/Comercial/Facturacion/emission');

export type EmissionOutcome =
  | { status: 'autorizada'; cae: string; caeDueDate: string; number: number; observations: ArcaMessage[] }
  | { status: 'rechazada'; errors: ArcaMessage[]; observations: ArcaMessage[] }
  | { status: 'pendiente'; number: number; message: string }
  | { status: 'invalid'; problems: IssueProblem[] }
  | { status: 'error'; message: string };

export type InvoiceValidation = {
  problems: IssueProblem[];
  /** Letra que corresponde y su explicación (las NC/ND heredan la del original). */
  letter: LetterResult;
  /** Solo NC: total y saldo acreditable del comprobante original. */
  credit: { total: string; remaining: string } | null;
};

/**
 * Valida un comprobante para emitir con el estado ACTUAL de la empresa y el cliente. Única
 * implementación: la usan el editor (checklist) y la emisión (otra vez, en el servidor).
 */
export async function validateLoadedInvoice(invoice: LoadedInvoice): Promise<InvoiceValidation> {
  const overview = await getFiscalDataOverview();
  const kind = kindOf(invoice.cbte_type);
  const currentLetter = letterOf(invoice.cbte_type);
  const letter: LetterResult =
    kind === 'invoice'
      ? resolveLetter(overview.profile?.tax_condition ?? null, invoice.customer.vat_condition_id, invoice.customer.name)
      : {
          ok: true,
          letter: currentLetter,
          reason: invoice.associated_invoice
            ? `Misma letra que ${formatVoucherLabel(invoice.associated_invoice.cbte_type, invoice.associated_invoice.sales_point.number, invoice.associated_invoice.number)}.`
            : 'Misma letra que el comprobante original.',
        };
  const credit =
    kind === 'credit_note' && invoice.associated_invoice_id
      ? await creditableRemaining(invoice.associated_invoice_id, invoice.id)
      : null;

  const problems = validateInvoiceForIssue({
    kind,
    issueDate: toDateOnly(invoice.issue_date) ?? '',
    todayAr: argentinaDateOnly(new Date()),
    concept: invoice.concept,
    serviceFrom: toDateOnly(invoice.service_from),
    serviceTo: toDateOnly(invoice.service_to),
    paymentDueDate: toDateOnly(invoice.payment_due_date),
    currency: invoice.currency,
    total: invoice.total.toFixed(2),
    salesPoint: { active: invoice.sales_point.is_active },
    customer: {
      name: invoice.customer.name,
      cuit: invoice.customer.cuit.toString(),
      vatConditionId: invoice.customer.vat_condition_id,
      street: invoice.customer.fiscal_street,
      city: invoice.customer.fiscal_city,
      postalCode: invoice.customer.fiscal_postal_code,
    },
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity.toString(),
      netAmount: l.net_amount.toFixed(2),
      vatRateId: l.vat_rate_id,
    })),
    letter: letter.ok ? { ok: true } : { ok: false, error: letter.error },
    readinessBlockers: overview.readiness.blockers,
    creditableRemaining: credit?.remaining,
  });

  // Una factura tiene que salir con la letra que corresponde HOY al cliente.
  if (kind === 'invoice' && letter.ok && currentLetter !== letter.letter) {
    problems.push({
      field: 'customer',
      message: `El tipo cambió a Factura ${letter.letter} (cambió la condición IVA): guardá el borrador para actualizarlo.`,
    });
  }
  return { problems, letter, credit };
}

/** Arma el pedido a ARCA con los datos YA persistidos del comprobante. */
function buildCaeRequest(invoice: LoadedInvoice, number: number, exchangeRate: string, issuerCuit: string): CaeRequest {
  const services = invoice.concept !== 1;
  const date = (d: Date | null) => (d ? toArcaDate(toDateOnly(d)!) : undefined);
  const associated = invoice.associated_invoice;
  return {
    salesPoint: invoice.sales_point.number,
    cbteType: invoice.cbte_type,
    detail: {
      concept: invoice.concept,
      docType: invoice.receiver_doc_type,
      docNumber: invoice.receiver_doc_number.toString(),
      number,
      cbteDate: date(invoice.issue_date)!,
      total: invoice.total.toFixed(2),
      untaxed: invoice.net_untaxed.toFixed(2),
      net: invoice.net_taxed.toFixed(2),
      exempt: invoice.exempt_amount.toFixed(2),
      otherTaxes: invoice.other_taxes.toFixed(2),
      vat: invoice.vat_total.toFixed(2),
      serviceFrom: services ? date(invoice.service_from) : undefined,
      serviceTo: services ? date(invoice.service_to) : undefined,
      paymentDue: services ? date(invoice.payment_due_date) : undefined,
      currencyId: invoice.arca_currency_id,
      exchangeRate,
      receiverVatConditionId: invoice.receiver_vat_condition_id,
      associated:
        associated && associated.number !== null
          ? [
              {
                type: associated.cbte_type,
                salesPoint: associated.sales_point.number,
                number: associated.number,
                cuit: issuerCuit,
                cbteDate: toArcaDate(toDateOnly(associated.issue_date)!),
              },
            ]
          : undefined,
      vatBreakdown: invoice.vat_breakdown.map((v) => ({
        id: v.vat_rate_id,
        base: v.base_amount.toFixed(2),
        amount: v.vat_amount.toFixed(2),
      })),
    },
  };
}

/**
 * Aplica la autorización: estado, CAE y fecha en UNA sentencia, y los efectos sobre las
 * certificaciones (solo en producción: en homologación y simulado no se tocan las reales).
 */
export async function applyAuthorization(
  invoice: LoadedInvoice,
  result: { cae: string; caeDueDate: string; observations: ArcaMessage[] },
  number: number
): Promise<'applied' | 'already'> {
  const kind = kindOf(invoice.cbte_type);
  const caeDue = fromArcaDate(result.caeDueDate);
  const observations = JSON.stringify(result.observations);
  // El ESTADO de las certificaciones solo cambia en producción real; los vínculos se liberan siempre
  // (así en homologación/demo se puede refacturar después de una NC total).
  const affectsCertifications = invoice.environment === 'produccion' && !invoice.simulated;

  return prisma.$transaction(async (tx) => {
    // authorized_at con NOW() de Postgres: escribir un Date de JS en timestamptz se corre por el TZ.
    // Solo desde emitiendo/pendiente: si otro proceso ya lo autorizó (reconciliación concurrente),
    // no se pisa ni se repiten los efectos.
    const updated = await tx.$executeRaw`
      UPDATE invoices
      SET status = 'autorizada', number = ${number}, cae = ${result.cae}, cae_due_date = ${caeDue}::date,
          authorized_at = NOW(), arca_result = 'A', arca_observations = ${observations}::jsonb,
          arca_errors = NULL, updated_at = NOW()
      WHERE id = ${invoice.id}::uuid AND status IN ('emitiendo', 'pendiente')`;
    if (updated === 0) return 'already';

    if (kind === 'invoice' && affectsCertifications) {
      const ids = invoice.certifications.map((c) => c.certification_id);
      if (ids.length > 0) {
        const { count } = await tx.certifications.updateMany({
          where: { id: { in: ids }, status: 'confirmada' },
          data: { status: 'facturada' },
        });
        // El CAE ya existe: no se deshace. Se marca para revisión si algo no cuadra.
        if (count !== ids.length) {
          logger.error('Certificaciones que no estaban confirmadas al facturar', {
            data: { invoiceId: invoice.id, ids, count },
          });
        }
      }
    }

    if (kind === 'credit_note' && invoice.associated_invoice_id) {
      const credit = await creditableRemaining(invoice.associated_invoice_id);
      // NC que completa el total del original: las certificaciones vuelven a estar facturables.
      if (compareAmounts(credit.remaining, '0.00') <= 0) {
        const links = await tx.invoice_certifications.findMany({
          where: { invoice_id: invoice.associated_invoice_id, released_at: null },
          select: { id: true, certification_id: true },
        });
        if (links.length > 0) {
          await tx.$executeRaw`UPDATE invoice_certifications SET released_at = NOW() WHERE id = ANY(${links.map((l) => l.id)}::uuid[])`;
          if (affectsCertifications) {
            await tx.certifications.updateMany({
              where: { id: { in: links.map((l) => l.certification_id) }, status: 'facturada' },
              data: { status: 'confirmada' },
            });
          }
        }
      }
    }
    return 'applied';
  });
}

/** Vuelve a un estado editable sin número (ARCA confirmó que no lo usó). */
async function backToEditable(invoiceId: string, status: 'borrador' | 'rechazada', errors: ArcaMessage[] | null) {
  await prisma.invoices.update({
    where: { id: invoiceId },
    data: {
      status,
      number: null,
      arca_result: status === 'rechazada' ? 'R' : null,
      arca_errors: errors ? (errors as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
}

/**
 * Emite un comprobante. Devuelve qué pasó con números reales (para que la UI no mienta). Puede
 * tardar: hasta dos llamadas a ARCA más el lease.
 */
export async function issueInvoice(
  invoiceId: string,
  companyId: string,
  userId: string | null
): Promise<EmissionOutcome> {
  const invoice = await loadInvoice(invoiceId, companyId);
  if (!invoice) return { status: 'error', message: 'Comprobante no encontrado' };
  if (!canIssue(invoice.status)) {
    return {
      status: 'error',
      message:
        invoice.status === 'autorizada'
          ? 'El comprobante ya está autorizado.'
          : 'El comprobante se está emitiendo o está pendiente en ARCA: consultá su estado.',
    };
  }

  const { problems } = await validateLoadedInvoice(invoice);
  if (problems.length > 0) return { status: 'invalid', problems };

  const overview = await getFiscalDataOverview();
  // Las NC/ND se emiten en el ambiente del comprobante que ajustan.
  const environment = invoice.associated_invoice ? invoice.associated_invoice.environment : overview.environment;
  const simulated = isArcaMockMode();
  const previousStatus = invoice.status as 'borrador' | 'rechazada';

  // ── 1. Reclamar (transacción corta, sin ARCA) ────────────────────────────────
  try {
    const blocking = await prisma.invoices.findFirst({
      where: {
        id: { not: invoiceId },
        sales_point_id: invoice.sales_point_id,
        environment,
        cbte_type: invoice.cbte_type,
        OR: [{ status: 'pendiente' }, { status: 'emitiendo' }],
      },
      select: { id: true, number: true },
    });
    if (blocking) {
      return {
        status: 'error',
        message:
          'Hay otro comprobante de este punto de venta y tipo pendiente de confirmar en ARCA. Consultá su estado antes de emitir otro.',
      };
    }

    const issuer = await loadIssuer(companyId);
    const issuerSnapshot = buildIssuerSnapshot(issuer);
    const receiverSnapshot = buildReceiverSnapshot(invoice.customer);

    const claimed = await prisma.$transaction(async (tx) => {
      // NC: se serializan las notas del mismo original (aunque usen otro punto de venta) y se
      // vuelve a controlar el saldo con la fila bloqueada, así dos NC no acreditan de más.
      if (kindOf(invoice.cbte_type) === 'credit_note' && invoice.associated_invoice_id) {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoice.associated_invoice_id}::uuid FOR UPDATE`;
        const rows = await tx.$queryRaw<{ credited: string | null }[]>`
          SELECT COALESCE(SUM(total), 0)::text AS credited
          FROM invoices
          WHERE associated_invoice_id = ${invoice.associated_invoice_id}::uuid
            AND cbte_type = ANY(${cbteTypesOfKind('credit_note')}::int[])
            AND status IN ('autorizada', 'emitiendo', 'pendiente')
            AND id <> ${invoiceId}::uuid`;
        const original = invoice.associated_invoice!;
        const remaining = amountOf(original.total.toFixed(2)) - amountOf(rows[0]?.credited ?? '0');
        if (amountOf(invoice.total.toFixed(2)) > remaining) return 'exceeds' as const;
      }
      const { count } = await tx.invoices.updateMany({
        where: { id: invoiceId, status: previousStatus },
        data: {
          status: 'emitiendo',
          environment,
          simulated,
          claimed_at: new Date(),
          attempt_count: { increment: 1 },
          emitted_by: userId,
          issuer_snapshot: issuerSnapshot as unknown as Prisma.InputJsonValue,
          receiver_snapshot: receiverSnapshot as unknown as Prisma.InputJsonValue,
          arca_errors: Prisma.DbNull,
        },
      });
      if (count !== 1) return 'changed' as const;
      // Las certificaciones quedan reservadas en el ambiente con el que se emite. En producción el
      // índice único impide que otra factura viva las tenga.
      await tx.invoice_certifications.updateMany({ where: { invoice_id: invoiceId }, data: { environment } });
      return 'ok' as const;
    });
    if (claimed === 'exceeds') {
      return {
        status: 'error',
        message: 'La nota de crédito supera el saldo del comprobante original (otra nota se emitió mientras tanto).',
      };
    }
    if (claimed === 'changed')
      return { status: 'error', message: 'El comprobante cambió de estado mientras tanto. Actualizá la pantalla.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { status: 'error', message: 'Alguna certificación ya está facturada en otro comprobante.' };
    }
    throw error;
  }

  // ── 2. Numerar y pedir el CAE (con lease, fuera de transacción) ─────────────
  const lockKey = `emit:${invoice.sales_point_id}:${environment}:${invoice.cbte_type}`;
  try {
    return await withLease(
      lockKey,
      {
        ttlMs: 120_000,
        waitMs: 20_000,
        busyMessage: 'Se está emitiendo otro comprobante de este punto de venta. Probá en unos segundos.',
      },
      async () => {
        let gateway: ArcaGateway;
        try {
          gateway = await getArcaGateway(companyId, environment, { invoiceId });
        } catch (error) {
          await backToEditable(invoiceId, previousStatus, null);
          throw error;
        }

        const fresh = (await loadInvoice(invoiceId, companyId))!;
        const gatewayCuit = parseIssuerSnapshot(fresh.issuer_snapshot)?.cuit ?? '';
        let attempt = 0;
        // Máximo 2 intentos: el segundo solo si ARCA dice que el número esperado era otro (10016).
        while (true) {
          attempt++;
          let number: number;
          let exchangeRate = fresh.exchange_rate.toString();
          try {
            number = (await gateway.lastAuthorized(fresh.sales_point.number, fresh.cbte_type)) + 1;
            if (fresh.currency !== 'ARS' && !fresh.associated_invoice_id) {
              exchangeRate = (await gateway.exchangeRate(fresh.arca_currency_id)).rate;
            }
          } catch (error) {
            // No se pidió el CAE: ARCA no hizo nada. Se vuelve a editar.
            await backToEditable(invoiceId, previousStatus, error instanceof ArcaServiceError ? error.errors : null);
            throw error;
          }

          const request = buildCaeRequest(fresh, number, exchangeRate, gatewayCuit);
          // ── El ancla: número, cotización y pedido exacto guardados ANTES de enviar. ──
          await prisma.invoices.update({
            where: { id: invoiceId },
            data: {
              number,
              exchange_rate: exchangeRate,
              exchange_rate_date: fresh.currency !== 'ARS' ? fresh.issue_date : null,
              request_payload: request as unknown as Prisma.InputJsonValue,
              sent_at: new Date(),
            },
          });

          let result;
          try {
            result = await gateway.requestCae(request);
          } catch (error) {
            if (error instanceof ArcaError && error.outcomeKnown) {
              await backToEditable(invoiceId, previousStatus, null);
              throw error;
            }
            // Pudo haberse autorizado: queda pendiente con su número para consultar.
            await prisma.invoices.update({ where: { id: invoiceId }, data: { status: 'pendiente' } });
            logger.warn('Comprobante pendiente: ARCA no respondió', { data: { invoiceId, number } });
            return {
              status: 'pendiente',
              number,
              message:
                'ARCA no respondió. El comprobante puede haberse autorizado: consultá su estado antes de hacer otra cosa.',
            } as const;
          }

          if (result.result === 'A' && result.cae && result.caeDueDate) {
            try {
              const authorizedInvoice = (await loadInvoice(invoiceId, companyId))!;
              await applyAuthorization(
                authorizedInvoice,
                { cae: result.cae, caeDueDate: result.caeDueDate, observations: result.observations },
                number
              );
            } catch (error) {
              // ARCA YA autorizó: no se puede volver atrás. Queda pendiente y la consulta adopta el CAE.
              logger.error('CAE obtenido pero no se pudo guardar: queda pendiente', {
                data: { invoiceId, number, error },
              });
              await prisma.invoices.updateMany({
                where: { id: invoiceId, status: 'emitiendo' },
                data: { status: 'pendiente' },
              });
              return {
                status: 'pendiente',
                number,
                message:
                  'ARCA autorizó el comprobante pero no se pudo guardar el resultado. Consultá su estado para completarlo.',
              } as const;
            }
            logger.info('Comprobante autorizado', { data: { invoiceId, number, simulated } });
            return {
              status: 'autorizada',
              cae: result.cae,
              caeDueDate: fromArcaDate(result.caeDueDate),
              number,
              observations: result.observations,
            } as const;
          }

          const numberMismatch = result.errors.some((e) => e.code === 10016);
          if (numberMismatch && attempt < 2) continue;

          await backToEditable(invoiceId, 'rechazada', [...result.errors, ...result.observations]);
          logger.warn('Comprobante rechazado por ARCA', { data: { invoiceId, errors: result.errors } });
          return { status: 'rechazada', errors: result.errors, observations: result.observations } as const;
        }
      }
    );
  } catch (error) {
    // Si el lease no se pudo tomar, el comprobante sigue `emitiendo` sin número: volverlo.
    const current = await prisma.invoices.findUnique({
      where: { id: invoiceId },
      select: { status: true, number: true },
    });
    if (current?.status === 'emitiendo' && current.number === null)
      await backToEditable(invoiceId, previousStatus, null);
    if (error instanceof ArcaError || error instanceof ArcaConfigError)
      return { status: 'error', message: error.message };
    throw error;
  }
}

export type ReconcileOutcome =
  | { status: 'autorizada'; cae: string; number: number }
  | { status: 'borrador'; message: string }
  | { status: 'pendiente'; message: string }
  | { status: 'revision'; message: string }
  | { status: 'error'; message: string };

/**
 * Consulta en ARCA un comprobante pendiente (o un `emitiendo` abandonado) y lo resuelve:
 * autorizado → se adopta el CAE; inexistente y con el último autorizado menor → vuelve a borrador;
 * existe pero no coincide → revisión manual (nunca se adopta algo que no es nuestro).
 */
export async function reconcileInvoice(invoiceId: string, companyId: string): Promise<ReconcileOutcome> {
  const invoice = await loadInvoice(invoiceId, companyId);
  if (!invoice) return { status: 'error', message: 'Comprobante no encontrado' };
  const lastActivity = invoice.sent_at ?? invoice.claimed_at;
  const stale =
    invoice.status === 'emitiendo' && (!lastActivity || Date.now() - lastActivity.getTime() > STALE_EMITTING_MS);
  if (invoice.status !== 'pendiente' && !stale) {
    return { status: 'error', message: 'Solo se consulta un comprobante pendiente en ARCA.' };
  }
  if (invoice.number === null) {
    await backToEditable(invoiceId, 'borrador', null);
    return { status: 'borrador', message: 'El comprobante no llegó a enviarse a ARCA: volvió a borrador.' };
  }

  try {
    const gateway = await getArcaGateway(companyId, invoice.environment, { invoiceId });
    const found = await gateway.consult(invoice.sales_point.number, invoice.cbte_type, invoice.number);

    if (found) {
      const matches =
        found.result === 'A' &&
        found.cae &&
        found.caeDueDate &&
        found.docNumber === invoice.receiver_doc_number.toString() &&
        found.total !== undefined &&
        compareAmounts(Number(found.total).toFixed(2), invoice.total.toFixed(2)) === 0;
      if (matches) {
        await applyAuthorization(
          invoice,
          { cae: found.cae!, caeDueDate: found.caeDueDate!, observations: found.observations },
          invoice.number
        );
        return { status: 'autorizada', cae: found.cae!, number: invoice.number };
      }
      await prisma.invoices.update({
        where: { id: invoiceId },
        data: {
          needs_review: true,
          review_note: `ARCA tiene el número ${invoice.number} con otros datos (total ${found.total ?? '?'}, documento ${found.docNumber ?? '?'}).`,
        },
      });
      return { status: 'revision', message: 'ARCA tiene ese número con otros datos. Hace falta revisarlo a mano.' };
    }

    const last = await gateway.lastAuthorized(invoice.sales_point.number, invoice.cbte_type);
    if (last < invoice.number) {
      await backToEditable(invoiceId, 'borrador', null);
      return {
        status: 'borrador',
        message: 'ARCA confirma que no se autorizó: el comprobante volvió a borrador y se puede emitir de nuevo.',
      };
    }
    return { status: 'pendiente', message: 'ARCA todavía no informa el comprobante. Probá de nuevo en unos minutos.' };
  } catch (error) {
    if (error instanceof ArcaError) return { status: 'error', message: error.message };
    throw error;
  }
}
