import { CertificationAmount } from '@/features/Comercial/Certificaciones/components/CertificationAmount';
import { CertificationStatusBadge } from '@/features/Comercial/Certificaciones/components/CertificationStatusBadge';
import { formatInCurrency } from '@/features/Treasury/lib/currency-format';
import { CONCEPTS, VAT_RATE_LABELS, isVatRateId, type ConceptId } from '@/shared/lib/arca/catalogs';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { formatCuitText } from '@/shared/utils/cuit-text';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, SearchCheck } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import type { InvoiceEditorData } from '../../actions/invoices.server';
import { InvoiceOriginSkeleton } from '../../fallback/InvoiceOriginSkeleton';
import { INVOICE_STATUS_LABELS } from '../../lib/invoice-state-machine';
import { formatAddress } from '../../lib/snapshots';
import { TAX_CONDITION_PRINT } from '../../pdf/invoice-pdf-data';
import { INVOICING_TAB_HREF, invoiceHref } from '../../utils/invoice-links';
import { formatDecimalText } from '../../utils/number-text';
import { ArcaMessagesList } from '../ArcaMessagesList';
import { InvoiceEnvironmentNotice } from '../InvoiceEnvironmentNotice';
import { InvoiceLetterBox } from '../InvoiceLetterBox';
import { InvoiceStatusBadge } from '../InvoiceStatusBadge';
import type { InvoicePermissions } from '../editor/InvoiceDraftForm';
import { AdjustmentActions } from './AdjustmentActions';
import { FocusOnMountHeading } from './FocusOnMountHeading';
import { InvoiceOriginChain, type InvoiceOriginAccess } from './InvoiceOriginChain';
import { InvoicePdfActions } from './InvoicePdfActions';
import { ReconcileInvoicePanel } from './ReconcileInvoicePanel';

/** Si el comprobante se autorizó hace menos que esto, el PDF puede estar generándose todavía. */
const PDF_GRACE_MS = 3 * 60 * 1000;

const date = (value: string | null) => (value ? moment.utc(value).format('DD/MM/YYYY') : '—');

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/**
 * Detalle de un comprobante enviado a ARCA (autorizado, pendiente o emitiéndose). Server Component:
 * solo las acciones (PDF, consultar, notas) son islas de cliente.
 */
export function InvoiceDetail({
  data,
  permissions,
  result,
  receivable = null,
  originAccess,
}: {
  data: InvoiceEditorData;
  permissions: InvoicePermissions;
  result: string | null;
  /** Qué eslabones de la cadena de origen puede abrir el usuario (permisos por módulo). */
  originAccess: InvoiceOriginAccess;
  /** Pendiente de cobro (Tesorería): solo llega con `tesoreria:cobranzas:view` y si es cobrable. */
  receivable?: {
    pending: string;
    reserved: string;
    currency: string;
    customerId: string;
    state: 'PENDING' | 'IN_DRAFT' | 'COLLECTED' | 'NO_BALANCE';
    canCollect: boolean;
  } | null;
}) {
  const { invoice } = data;
  const prices = permissions.canViewPrices;
  const canEmit = permissions.canApprove && permissions.canViewPrices;
  const isAuthorized = invoice.status === 'autorizada';
  const isPending = invoice.status === 'pendiente' || invoice.status === 'emitiendo';
  const voucherLabel = `${invoice.cbteLabel} ${invoice.voucherNumber}`;
  const issuer = invoice.issuerSnapshot;
  const receiver = invoice.receiverSnapshot;
  const receiverName = receiver?.name ?? invoice.customer.name;
  const receiverCuit = receiver?.cuit ?? invoice.customer.cuit;
  const receiverVat = receiver?.vatConditionLabel ?? invoice.customer.vatConditionLabel;
  const receiverAddress = formatAddress(receiver ?? invoice.customer);
  const showVat = invoice.letter !== 'C';
  const conceptLabel = CONCEPTS[invoice.concept as ConceptId] ?? '—';

  const hasAuthorizedCredit = invoice.adjustments.some((a) => a.kind === 'credit_note' && a.status === 'autorizada');
  const showAdjustments = isAuthorized && permissions.canCreate && invoice.kind !== 'credit_note';
  const waitForPdf =
    isAuthorized &&
    !invoice.hasPdf &&
    invoice.authorizedAt !== null &&
    Date.now() - Date.parse(invoice.authorizedAt) < PDF_GRACE_MS;

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* ── Encabezado ── */}
      <div className="flex flex-col gap-3">
        <Link
          href={INVOICING_TAB_HREF}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex w-fit items-center gap-1 text-sm outline-none focus-visible:ring-[3px]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Facturación
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <InvoiceLetterBox letter={invoice.letter} />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-balance tabular-nums">{voucherLabel}</h1>
              <p className="text-muted-foreground text-sm">
                <span className="break-words">{receiverName}</span>
                {invoice.authorizedAt && (
                  <span className="tabular-nums"> · Emitida el {formatArgentinaDay(invoice.authorizedAt)}</span>
                )}
              </p>
            </div>
          </div>
          <InvoiceStatusBadge
            status={invoice.status}
            simulated={invoice.simulated}
            environment={invoice.environment}
            hasObservations={invoice.arcaObservations.length > 0}
            needsReview={invoice.needsReview}
          />
        </div>
      </div>

      <InvoiceEnvironmentNotice environment={invoice.environment} simulated={invoice.simulated} scope="voucher" />

      {/* ── Resultado (persistente) ── */}
      {isAuthorized && (
        <section aria-labelledby="invoice-result-title" className="flex flex-col gap-3 border px-4 py-4">
          <FocusOnMountHeading
            id="invoice-result-title"
            focus={result === 'emitida'}
            documentTitle={`${voucherLabel} autorizada · Facturación`}
            className="flex items-center gap-2 font-semibold"
          >
            <CheckCircle2 className="text-brand-ink size-5 shrink-0" aria-hidden />
            {voucherLabel} autorizada.
          </FocusOnMountHeading>
          <p className="text-sm tabular-nums">
            CAE <span className="font-medium">{invoice.cae}</span> · vence el {date(invoice.caeDueDate)}
          </p>
          {receivable && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
              <span>
                {receivable.state === 'PENDING' && (
                  <>
                    Pendiente de cobro:{' '}
                    <span className="font-medium">{formatInCurrency(receivable.pending, receivable.currency)}</span>
                  </>
                )}
                {receivable.state === 'IN_DRAFT' && (
                  <>
                    En un recibo en borrador por{' '}
                    <span className="font-medium">{formatInCurrency(receivable.reserved, receivable.currency)}</span>{' '}
                    (todavía no cobrada)
                  </>
                )}
                {receivable.state === 'COLLECTED' && 'Cobrada'}
                {receivable.state === 'NO_BALANCE' && 'Sin saldo: la cancelan notas de crédito'}
              </span>
              <Link
                href={`/dashboard/treasury/customers/${receivable.customerId}`}
                className="underline underline-offset-4"
              >
                Ver cuenta corriente
              </Link>
              {receivable.canCollect && receivable.state === 'PENDING' && (
                <Link
                  href={`/dashboard/treasury/receipts/new?customerId=${receivable.customerId}&invoiceId=${invoice.id}`}
                  className="underline underline-offset-4"
                >
                  Cobrar
                </Link>
              )}
            </p>
          )}
          {invoice.arcaObservations.length > 0 && (
            <div className="flex flex-col gap-1 border border-warn/35 bg-warn-subtle text-warn-subtle-foreground px-3 py-2 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                ARCA la autorizó con observaciones:
              </p>
              <ArcaMessagesList messages={invoice.arcaObservations} />
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3">
            {prices ? (
              <InvoicePdfActions
                invoiceId={invoice.id}
                voucherLabel={voucherLabel}
                hasPdf={invoice.hasPdf}
                pdfUrl={invoice.pdfUrl}
                pdfDownloadUrl={invoice.pdfDownloadUrl}
                canRegenerate={prices}
                waitForPdf={waitForPdf}
              />
            ) : (
              <p className="text-muted-foreground text-sm">El PDF tiene importes: necesitás el permiso Ver precios.</p>
            )}
            {showAdjustments && (
              <AdjustmentActions
                invoiceId={invoice.id}
                voucherLabel={voucherLabel}
                canCredit
                totalCreditBlockedReason={
                  hasAuthorizedCredit ? 'Ya tiene notas de crédito: cargá una parcial por el saldo.' : null
                }
              />
            )}
          </div>
        </section>
      )}

      {isPending && (
        <section
          aria-labelledby="invoice-result-title"
          className="flex flex-col gap-3 border border-warn/35 bg-warn-subtle text-warn-subtle-foreground px-4 py-4 text-sm"
        >
          <FocusOnMountHeading
            id="invoice-result-title"
            focus={result === 'pendiente'}
            documentTitle={`${voucherLabel} pendiente · Facturación`}
            className="flex items-center gap-2 font-semibold text-warn-subtle-foreground"
          >
            <Clock className="size-5 shrink-0" aria-hidden />
            ARCA no confirmó si autorizó el comprobante.
          </FocusOnMountHeading>
          <p className="text-pretty">
            Puede haberse autorizado como <span className="font-medium tabular-nums">{voucherLabel}</span>. No lo
            vuelvas a emitir: consultá su estado.
          </p>
          <ReconcileInvoicePanel invoiceId={invoice.id} voucherLabel={voucherLabel} canReconcile={canEmit} />
        </section>
      )}

      {invoice.needsReview && (
        <div
          role="note"
          className="border-destructive/40 text-destructive flex items-start gap-3 border px-4 py-3 text-sm"
        >
          <SearchCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-pretty">
            Este comprobante necesita una revisión manual.{invoice.reviewNote ? ` ${invoice.reviewNote}` : ''}
          </p>
        </div>
      )}

      {/* ── Documento ── */}
      <article
        aria-labelledby="invoice-document-title"
        className="@container/doc flex flex-col gap-6 border p-4 sm:p-6"
      >
        <h2 id="invoice-document-title" className="sr-only">
          Datos del comprobante
        </h2>

        <div className="grid grid-cols-1 gap-6 @2xl/doc:grid-cols-2">
          <section aria-labelledby="doc-issuer" className="flex flex-col gap-2">
            <h3 id="doc-issuer" className="font-semibold">
              Emisor
            </h3>
            {issuer ? (
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <Field label="Razón social">{issuer.name}</Field>
                <Field label="CUIT">
                  <span className="tabular-nums">{formatCuitText(issuer.cuit)}</span>
                </Field>
                <Field label="Condición frente al IVA">{TAX_CONDITION_PRINT[issuer.taxCondition]}</Field>
                <Field label="Domicilio">{formatAddress(issuer)}</Field>
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">Los datos del emisor se fijan al autorizarse.</p>
            )}
          </section>
          <section aria-labelledby="doc-receiver" className="flex flex-col gap-2">
            <h3 id="doc-receiver" className="font-semibold">
              Receptor
            </h3>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Field label="Razón social">{receiverName}</Field>
              <Field label="CUIT">
                <span className="tabular-nums">{formatCuitText(receiverCuit)}</span>
              </Field>
              <Field label="Condición frente al IVA">{receiverVat}</Field>
              {receiverAddress && <Field label="Domicilio">{receiverAddress}</Field>}
            </dl>
          </section>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm @2xl/doc:grid-cols-4">
          <Field label="Punto de venta">
            <span className="tabular-nums">{String(invoice.salesPoint.number).padStart(5, '0')}</span>
          </Field>
          <Field label="Fecha de emisión">
            <span className="tabular-nums">{date(invoice.issueDate)}</span>
          </Field>
          <Field label="Concepto">{conceptLabel}</Field>
          <Field label="Estado">{INVOICE_STATUS_LABELS[invoice.status]}</Field>
          {invoice.concept !== 1 && (
            <>
              <Field label="Período facturado">
                <span className="tabular-nums">
                  {date(invoice.serviceFrom)}–{date(invoice.serviceTo)}
                </span>
              </Field>
              <Field label="Vencimiento del pago">
                <span className="tabular-nums">{date(invoice.paymentDueDate)}</span>
              </Field>
            </>
          )}
          {invoice.cae && (
            <>
              <Field label="CAE">
                <span className="tabular-nums">{invoice.cae}</span>
              </Field>
              <Field label="Vencimiento del CAE">
                <span className="tabular-nums">{date(invoice.caeDueDate)}</span>
              </Field>
            </>
          )}
        </dl>

        {/* Líneas */}
        <section aria-labelledby="doc-lines" className="flex flex-col gap-2">
          <h3 id="doc-lines" className="font-semibold">
            Líneas
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs tracking-wide uppercase">
                  <th scope="col" className="py-2 pe-3 text-left font-medium">
                    Descripción
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Cantidad
                  </th>
                  {prices && (
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      P. unit. neto
                    </th>
                  )}
                  {showVat && (
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      IVA
                    </th>
                  )}
                  {prices && (
                    <th scope="col" className="py-2 ps-3 text-right font-medium">
                      Subtotal neto
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="align-top">
                    <td className="py-2 pe-3 text-pretty break-words">{line.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDecimalText(line.quantity, 0)}</td>
                    {prices && (
                      <td className="px-3 py-2 text-right tabular-nums">{formatDecimalText(line.unitPrice, 2)}</td>
                    )}
                    {showVat && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.vatRateId !== null && isVatRateId(line.vatRateId) ? VAT_RATE_LABELS[line.vatRateId] : '—'}
                      </td>
                    )}
                    {prices && (
                      <td className="py-2 ps-3 text-right whitespace-nowrap tabular-nums">
                        <CertificationAmount value={line.netAmount} currency={invoice.currency} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Totales */}
        {prices ? (
          <dl className="ms-auto flex w-full max-w-sm flex-col gap-1.5 text-sm">
            {showVat && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground font-medium">Neto gravado</dt>
                  <dd className="whitespace-nowrap tabular-nums">
                    <CertificationAmount value={invoice.netTaxed} currency={invoice.currency} />
                  </dd>
                </div>
                {invoice.vatBreakdown.map((vat) => (
                  <div key={vat.vatRateId} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground font-medium">
                      IVA {isVatRateId(vat.vatRateId) ? VAT_RATE_LABELS[vat.vatRateId] : vat.vatRateId}
                    </dt>
                    <dd className="whitespace-nowrap tabular-nums">
                      <CertificationAmount value={vat.amount} currency={invoice.currency} />
                    </dd>
                  </div>
                ))}
              </>
            )}
            <div className="border-foreground flex justify-between gap-3 border-t pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-xl font-semibold whitespace-nowrap tabular-nums">
                <CertificationAmount value={invoice.total} currency={invoice.currency} />
              </dd>
            </div>
            {invoice.currency !== 'ARS' && isAuthorized && (
              <p className="text-muted-foreground text-xs tabular-nums">
                Tipo de cambio {formatDecimalText(invoice.exchangeRate, 2)}
                {invoice.exchangeRateDate ? ` (ARCA, ${date(invoice.exchangeRateDate)})` : ''}
              </p>
            )}
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">Los importes están ocultos: necesitás el permiso Ver precios.</p>
        )}

        {invoice.notes && (
          <section aria-labelledby="doc-notes" className="flex flex-col gap-1">
            <h3 id="doc-notes" className="font-semibold">
              Observaciones
            </h3>
            <p className="text-sm text-pretty whitespace-pre-line break-words">{invoice.notes}</p>
          </section>
        )}
      </article>

      {/* ── Origen: pedido → partes → certificación → factura (su propio Suspense: no frena el detalle) ── */}
      <Suspense fallback={<InvoiceOriginSkeleton />}>
        <InvoiceOriginChain voucherLabel={voucherLabel} certifications={invoice.certifications} access={originAccess} />
      </Suspense>

      {/* ── Comprobantes vinculados ── */}
      {invoice.associatedInvoice && (
        <p className="text-sm">
          Asociada a{' '}
          <Link
            href={invoiceHref(invoice.associatedInvoice.id)}
            className="font-medium tabular-nums underline underline-offset-4"
          >
            {invoice.associatedInvoice.label}
          </Link>
          .
        </p>
      )}

      {invoice.adjustments.length > 0 && (
        <section aria-labelledby="invoice-adjustments" className="flex flex-col gap-2">
          <h2 id="invoice-adjustments" className="text-lg font-semibold">
            Notas de crédito y débito
          </h2>
          <ul className="divide-y border">
            {invoice.adjustments.map((adj) => (
              <li key={adj.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link href={invoiceHref(adj.id)} className="font-medium tabular-nums underline underline-offset-4">
                  {adj.label}
                </Link>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">{INVOICE_STATUS_LABELS[adj.status]}</span>
                  {prices && (
                    <span className="whitespace-nowrap">
                      {adj.kind === 'credit_note' ? '−' : ''}
                      <CertificationAmount value={adj.total} currency={invoice.currency} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {invoice.certifications.length > 0 && (
        <section aria-labelledby="invoice-certifications" className="flex flex-col gap-2">
          <h2 id="invoice-certifications" className="text-lg font-semibold">
            Certificaciones incluidas
          </h2>
          <ul className="divide-y border">
            {invoice.certifications.map((cert) => (
              <li key={cert.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="flex flex-col">
                  <span className="font-medium tabular-nums">{cert.number}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {date(cert.periodFrom)}–{date(cert.periodTo)}
                    {cert.released && ' · liberada por nota de crédito'}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <CertificationStatusBadge status={cert.status} />
                  {prices && (
                    <span className="whitespace-nowrap">
                      <CertificationAmount value={cert.amount} currency={invoice.currency} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
