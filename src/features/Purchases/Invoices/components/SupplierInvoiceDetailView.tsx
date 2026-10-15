import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney, formatQuantity, formatUnitCost } from '@/features/Warehouses/lib/format';
import { RECEIVER_VAT_CONDITIONS, isReceiverVatConditionId } from '@/shared/lib/arca/catalogs';
import { Paperclip, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import Link from 'next/link';
import type { SupplierInvoiceDetail } from '../../lib/invoice-query-types';
import { HistoryCard } from '../../components/HistoryCard';
import { ARCA_CHECK_LABELS } from '../../lib/invoice-status';
import { SUPPLIER_INVOICE_TAX_LABELS } from '../../schemas/invoices';
import { SupplierInvoiceActions } from './SupplierInvoiceActions';
import { SupplierInvoiceStatusBadge } from './SupplierInvoiceStatusBadge';
import { PaymentOrderStatusBadge } from '../../Payments/components/PaymentOrderStatusBadge';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';

const day = (value: string | null) => (value ? formatDateAr(value) : '—');
const period = (value: string) => {
  const text = moment(value, 'YYYY-MM').locale('es').format('MMMM YYYY');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const ARCA_ICONS = { APPROVED: ShieldCheck, REJECTED: ShieldX, UNAVAILABLE: ShieldAlert } as const;
const ARCA_CLASSES = {
  APPROVED: 'text-ok-subtle-foreground',
  REJECTED: 'text-danger-subtle-foreground',
  UNAVAILABLE: 'text-warn-subtle-foreground',
} as const;

/** Detalle del comprobante: datos, lineas con las diferencias resaltadas, IVA, tributos y estado. */
export function SupplierInvoiceDetailView({ invoice }: { invoice: SupplierInvoiceDetail }) {
  const vatCondition = isReceiverVatConditionId(invoice.supplier.vat_condition_id)
    ? RECEIVER_VAT_CONDITIONS[invoice.supplier.vat_condition_id].label
    : '—';
  const isCredit = invoice.kind === 'credit_note';
  const ArcaIcon = invoice.arcaCheck ? ARCA_ICONS[invoice.arcaCheck.result] : null;

  return (
    <div className="space-y-4">
      <RecordHeader
        identity={
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{invoice.label}</h1>
            <SupplierInvoiceStatusBadge status={invoice.status} />
          </div>
        }
        actions={<SupplierInvoiceActions invoice={invoice} />}
      />

      {invoice.status === 'OBSERVED' && invoice.observations.length > 0 && (
        <AttentionBanner
          tone="warn"
          title={`Observada: ${invoice.observations.length} ${invoice.observations.length === 1 ? 'diferencia' : 'diferencias'}`}
          description={
            <>
              {invoice.observations.map((o, i) => (
                <span key={`${o.code}-${i}`} className="block">
                  • {o.message}
                </span>
              ))}
              <span className="mt-2 block">Quien tenga permiso de aprobar la acepta (queda a pagar) o la rechaza.</span>
            </>
          }
        />
      )}
      {invoice.resolution && (invoice.status === 'APPROVED' || invoice.status === 'REJECTED') && (
        <AttentionBanner
          tone={invoice.status === 'REJECTED' ? 'danger' : 'ok'}
          title={invoice.status === 'APPROVED' ? 'Aprobada con diferencias' : 'Rechazada'}
          description={
            <>
              <span className="block whitespace-pre-wrap">{invoice.resolution.comment}</span>
              {invoice.observations.map((o, i) => (
                <span key={`${o.code}-${i}`} className="block text-xs">
                  • {o.message}
                </span>
              ))}
            </>
          }
        />
      )}
      {invoice.status === 'CANCELLED' && invoice.cancelReason && (
        <AttentionBanner tone="danger" title="Anulada" description={<span className="whitespace-pre-wrap">{invoice.cancelReason}</span>} />
      )}

      <SectionCard title="Datos del comprobante">
        <div>
          <FieldGrid>
            <Field label="Proveedor">
              <Link href={`/dashboard/purchases/suppliers/${invoice.supplier.id}`} className="hover:underline">
                {invoice.supplier.name}
              </Link>
              <span className="block text-xs text-muted-foreground">
                CUIT {invoice.supplier.cuit} · {vatCondition}
              </span>
            </Field>
            <Field label="Fecha de emisión">{day(invoice.issueDate)}</Field>
            <Field label="Vencimiento del pago">{day(invoice.dueDate)}</Field>
            <Field label="Período IVA">{period(invoice.vatPeriod)}</Field>
            <Field label="CAE">
              {invoice.cae ?? '—'}
              {invoice.caeDueDate && <span className="block text-xs text-muted-foreground">vence {day(invoice.caeDueDate)}</span>}
            </Field>
            <Field label="Constatación en ARCA">
              {invoice.arcaCheck && ArcaIcon ? (
                <span className={`inline-flex items-center gap-1 ${ARCA_CLASSES[invoice.arcaCheck.result]}`}>
                  <ArcaIcon className="h-4 w-4" />
                  {ARCA_CHECK_LABELS[invoice.arcaCheck.result]}
                  {invoice.arcaCheck.at && <span className="text-muted-foreground"> · {formatArgentinaDateTime(invoice.arcaCheck.at)}</span>}
                </span>
              ) : (
                <span className="text-muted-foreground">{invoice.cae ? 'Sin constatar' : 'Sin CAE: no se puede constatar'}</span>
              )}
              {invoice.arcaCheck?.detail && <span className="block text-xs text-muted-foreground">{invoice.arcaCheck.detail}</span>}
            </Field>
            <Field label={isCredit ? 'Factura que corrige' : 'Notas vinculadas'}>
              {invoice.relatedInvoice ? (
                <Link href={`/dashboard/purchases/invoices/${invoice.relatedInvoice.id}`} className="underline">
                  {invoice.relatedInvoice.label}
                </Link>
              ) : invoice.relatedNotes.length > 0 ? (
                <span className="flex flex-col">
                  {invoice.relatedNotes.map((note) => (
                    <Link key={note.id} href={`/dashboard/purchases/invoices/${note.id}`} className="underline">
                      {note.label}
                      {note.status === 'CANCELLED' ? ' (anulada)' : ''}
                    </Link>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Comprobante">
              {invoice.attachment ? (
                <a href={invoice.attachment.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  <Paperclip className="h-3.5 w-3.5" />
                  {invoice.attachment.name}
                </a>
              ) : (
                'Sin adjunto'
              )}
            </Field>
          </FieldGrid>
          {invoice.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</p>}
        </div>
      </SectionCard>

      <SectionCard title="Líneas">
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Alícuota</TableHead>
                  <TableHead className="text-right">{invoice.letter === 'C' ? 'Importe' : 'Neto'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((line) => {
                  const flagged = line.observationCodes.length > 0;
                  const priceFlag = line.observationCodes.includes('PRICE');
                  const quantityFlag = line.observationCodes.includes('QUANTITY');
                  const rateFlag = line.observationCodes.includes('VAT_RATE');
                  return (
                    <TableRow key={line.id} className={flagged ? 'bg-warn-subtle' : undefined}>
                      <TableCell>
                        <span className="block">{line.itemLabel}</span>
                        <span className="block text-xs text-muted-foreground">
                          {line.order ? (
                            <Link href={`/dashboard/purchases/orders/${line.order.id}`} className="font-mono underline">
                              {line.order.number}
                            </Link>
                          ) : (
                            `Gasto · ${line.expenseCategory?.name ?? 'sin concepto'}`
                          )}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${quantityFlag ? 'font-medium text-warn-subtle-foreground' : ''}`}>
                        {line.quantity ? `${formatQuantity(line.quantity)} ${line.unitAbbr ?? ''}` : '—'}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${priceFlag ? 'font-medium text-warn-subtle-foreground' : ''}`}>
                        {line.unitPrice ? formatUnitCost(line.unitPrice) : '—'}
                        {priceFlag && line.orderUnitPrice && (
                          <span className="block text-xs font-normal">OC {formatUnitCost(line.orderUnitPrice)}</span>
                        )}
                      </TableCell>
                      <TableCell className={rateFlag ? 'font-medium text-warn-subtle-foreground' : ''}>{line.vatRateLabel ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(line.netTotal)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
      </SectionCard>

      <SectionCard title="Importes">
          <dl className="ml-auto grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">{invoice.letter === 'C' ? 'Importe de las líneas' : 'Neto gravado'}</dt>
            <dd className="text-right">{formatMoney(invoice.amounts.netTaxed)}</dd>
            {invoice.vat.map((v) => (
              <div key={v.vatRateId} className="contents">
                <dt className="text-muted-foreground">
                  IVA {v.label} <span className="text-xs">sobre {formatMoney(v.base)}</span>
                </dt>
                <dd className="text-right">{formatMoney(v.amount)}</dd>
              </div>
            ))}
            {Number(invoice.amounts.netUntaxed) > 0 && (
              <>
                <dt className="text-muted-foreground">No gravado</dt>
                <dd className="text-right">{formatMoney(invoice.amounts.netUntaxed)}</dd>
              </>
            )}
            {Number(invoice.amounts.exempt) > 0 && (
              <>
                <dt className="text-muted-foreground">Exento</dt>
                <dd className="text-right">{formatMoney(invoice.amounts.exempt)}</dd>
              </>
            )}
            {invoice.taxes.map((t) => (
              <div key={t.id} className="contents">
                <dt className="text-muted-foreground">
                  {SUPPLIER_INVOICE_TAX_LABELS[t.kind]}
                  {t.province ? ` · ${t.province}` : ''}
                  {t.description ? ` · ${t.description}` : ''}
                </dt>
                <dd className="text-right">{formatMoney(t.amount)}</dd>
              </div>
            ))}
            <dt className="text-base font-semibold">Total</dt>
            <dd className="text-right text-base font-semibold">{formatMoney(invoice.amounts.total)}</dd>
          </dl>
      </SectionCard>

      {invoice.status !== 'CANCELLED' && (
        <SectionCard title="Pagos">
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
              <div>
                <dt className="text-xs text-muted-foreground">Pagado</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(invoice.payment.paid)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pendiente (sin orden de pago)</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(invoice.payment.pending)}</dd>
              </div>
            </dl>
            {invoice.payment.orders.length > 0 ? (
              <ul className="divide-y">
                {invoice.payment.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <Link href={`/dashboard/purchases/payments/${o.id}`} className="font-mono underline">
                      {o.number}
                    </Link>
                    <PaymentOrderStatusBadge status={o.status} />
                    {o.paidOn && <span className="text-muted-foreground">pagada {formatDateAr(o.paidOn)}</span>}
                    <span className="ml-auto tabular-nums">{formatMoney(o.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no está en ninguna orden de pago.</p>
            )}
          </div>
        </SectionCard>
      )}

      <HistoryCard history={invoice.history} />
    </div>
  );
}
