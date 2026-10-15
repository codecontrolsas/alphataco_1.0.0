import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/features/Warehouses/lib/format';
import Link from 'next/link';
import type { PaymentOrderDetail } from '../../lib/payment-query-types';
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import { HistoryCard } from '../../components/HistoryCard';
import { OWN_CHECK_STATUS_LABELS } from '@/features/Treasury/lib/own-check-transitions';
import { PAYMENT_METHOD_LABELS } from '../../schemas/payment-orders';
import { WITHHOLDING_TAX_LABELS } from '../../schemas/payment-settings';
import { PaymentOrderActions } from './PaymentOrderActions';
import { PaymentOrderStatusBadge } from './PaymentOrderStatusBadge';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { formatDateAr } from '@/shared/lib/argentina-time';

const day = (value: string | null) => (value ? formatDateAr(value) : '—');

const KIND_LABELS = {
  INVOICE: 'Comprobante',
  CREDIT_NOTE: 'Nota de crédito aplicada',
  ADVANCE: 'Anticipo',
  ADVANCE_APPLIED: 'Anticipo aplicado',
  REJECTED_CHECK: 'Cheque rechazado',
} as const;

/** Detalle de la orden de pago: lo que paga, retenciones con certificados, medios e historial. */
export function PaymentOrderDetailView({ order, accounts }: { order: PaymentOrderDetail; accounts: TreasuryAccountRow[] }) {
  const t = order.totals;
  return (
    <div className="space-y-4">
      <RecordHeader
        identity={
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold">{order.number}</h1>
            <PaymentOrderStatusBadge status={order.status} />
          </div>
        }
        actions={<PaymentOrderActions order={order} accounts={accounts} />}
      />

      {order.rejectionNotes && (
        <AttentionBanner tone="warn" title="Rechazada" description={<span className="whitespace-pre-wrap">{order.rejectionNotes}</span>} />
      )}
      {order.status === 'CANCELLED' && order.cancelReason && (
        <AttentionBanner tone="danger" title="Anulada" description={<span className="whitespace-pre-wrap">{order.cancelReason}</span>} />
      )}

      <SectionCard title="Datos de la orden">
        <div>
          <FieldGrid>
            <Field label="Proveedor">
              <Link href={`/dashboard/purchases/suppliers/${order.supplier.id}`} className="hover:underline">
                {order.supplier.name}
              </Link>
              <span className="block text-xs text-muted-foreground">CUIT {order.supplier.cuit}</span>
            </Field>
            <Field label="Fecha prevista">{day(order.plannedOn)}</Field>
            <Field label="Fecha de pago">{day(order.paidOn)}</Field>
            <Field label="Neto a pagar">
              <span className="text-base font-semibold tabular-nums">{formatMoney(t.netTotal)}</span>
            </Field>
          </FieldGrid>
          {order.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{order.notes}</p>}
        </div>
      </SectionCard>

      <SectionCard title="Qué se paga">
          <div className="overflow-x-auto">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((l) => {
                  const subtracts = l.kind === 'CREDIT_NOTE' || l.kind === 'ADVANCE_APPLIED';
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <span className="block text-xs text-muted-foreground">{KIND_LABELS[l.kind]}</span>
                        {l.invoice ? (
                          <Link href={`/dashboard/purchases/invoices/${l.invoice.id}`} className="underline">
                            {l.invoice.label}
                          </Link>
                        ) : l.rejectedCheck ? (
                          <Link href={`/dashboard/treasury/${l.rejectedCheck.own ? 'own-checks' : 'checks'}/${l.rejectedCheck.id}`} className="underline">
                            {l.rejectedCheck.label}
                          </Link>
                        ) : l.sourceOrder ? (
                          <Link href={`/dashboard/purchases/payments/${l.sourceOrder.id}`} className="font-mono underline">
                            {l.sourceOrder.number}
                          </Link>
                        ) : (
                          <span>
                            {l.description ?? 'Anticipo'}
                            {l.purchaseOrder && (
                              <>
                                {' · '}
                                <Link href={`/dashboard/purchases/orders/${l.purchaseOrder.id}`} className="font-mono underline">
                                  {l.purchaseOrder.number}
                                </Link>
                              </>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{l.invoice ? day(l.invoice.dueDate) : '—'}</TableCell>
                      <TableCell className={`text-right tabular-nums ${subtracts ? 'text-danger-subtle-foreground' : ''}`}>
                        {subtracts ? '−' : ''}
                        {formatMoney(l.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <dl className="ml-auto mt-4 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Comprobantes</dt>
            <dd className="text-right">{formatMoney(t.invoicesTotal)}</dd>
            {Number(t.advanceTotal) > 0 && (
              <>
                <dt className="text-muted-foreground">Anticipo</dt>
                <dd className="text-right">{formatMoney(t.advanceTotal)}</dd>
              </>
            )}
            {Number(t.creditsTotal) > 0 && (
              <>
                <dt className="text-muted-foreground">NC y anticipos aplicados</dt>
                <dd className="text-right">−{formatMoney(t.creditsTotal)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Retenciones</dt>
            <dd className="text-right">−{formatMoney(t.withholdingsTotal)}</dd>
            <dt className="text-base font-semibold">Neto a pagar</dt>
            <dd className="text-right text-base font-semibold">{formatMoney(t.netTotal)}</dd>
          </dl>
      </SectionCard>

      <SectionCard title="Retenciones">
        <div className="space-y-2">
          {order.withholdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se practicaron retenciones.</p>
          ) : (
            order.withholdings.map((w) => (
              <div key={w.id} className={`rounded-md border p-3 text-sm ${w.cancelled ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{WITHHOLDING_TAX_LABELS[w.tax]}</span>
                  <span className="text-xs text-muted-foreground">
                    {w.regime.code} · {w.regime.description}
                  </span>
                  {w.certificateNumber && <span className="font-mono text-xs">{w.certificateNumber}</span>}
                  {w.cancelled && <span className="text-xs text-destructive">Anulado</span>}
                  {w.manual && <span className="rounded bg-warn-subtle px-1.5 text-xs text-warn-subtle-foreground">corregida</span>}
                  <span className="ml-auto font-medium tabular-nums">{formatMoney(w.amount)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{w.detail}</p>
              </div>
            ))
          )}
          {order.status === 'PAID' && order.withholdings.length > 0 && (
            <p className="text-xs text-muted-foreground">Los certificados van en el PDF de la orden, uno por hoja.</p>
          )}
        </div>
      </SectionCard>

      {order.payments.length > 0 && (
        <SectionCard title="Medios de pago">
            <ul className="divide-y">
              {order.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="font-medium">{PAYMENT_METHOD_LABELS[p.method]}</span>
                  <span className="text-muted-foreground">{p.account.name}</span>
                  {p.reference && <span className="text-muted-foreground">Ref. {p.reference}</span>}
                  {p.checkNumber && (
                    <span className="text-muted-foreground">
                      {p.thirdPartyCheck ? (
                        <Link href={`/dashboard/treasury/checks/${p.thirdPartyCheck.id}`} className="underline">
                          N° {p.checkNumber}
                        </Link>
                      ) : p.ownCheck ? (
                        <Link href={`/dashboard/treasury/own-checks/${p.ownCheck.id}`} className="underline">
                          N° {p.checkNumber}
                        </Link>
                      ) : (
                        `N° ${p.checkNumber}`
                      )}
                      {p.checkBank ? ` · ${p.checkBank}` : ''}
                      {p.thirdPartyCheck ? ` · librador ${p.thirdPartyCheck.drawerName}` : ''} · pago {day(p.checkDueOn)}
                    </span>
                  )}
                  {p.ownCheck ? (
                    <>
                      {p.ownCheck.debitedOn && <span className="text-muted-foreground">Débito: {day(p.ownCheck.debitedOn)}</span>}
                      <Badge variant="outline">{OWN_CHECK_STATUS_LABELS[p.ownCheck.status]}</Badge>
                    </>
                  ) : (
                    <>
                      {p.movement && !p.movement.cancelled && <span className="text-muted-foreground">Débito: {day(p.movement.date)}</span>}
                      {p.movement?.toDebit && !p.movement.cancelled && <Badge variant="outline">A debitar</Badge>}
                    </>
                  )}
                  <span className="ml-auto tabular-nums">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
        </SectionCard>
      )}

      <HistoryCard history={order.history} />
    </div>
  );
}
