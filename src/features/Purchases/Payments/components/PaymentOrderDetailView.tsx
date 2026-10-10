import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/features/Warehouses/lib/format';
import moment from 'moment';
import Link from 'next/link';
import type { PaymentOrderDetail } from '../../actions/payment-orders.server';
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import { HistoryCard } from '../../components/HistoryCard';
import { PAYMENT_METHOD_LABELS } from '../../schemas/payment-orders';
import { WITHHOLDING_TAX_LABELS } from '../../schemas/payment-settings';
import { PaymentOrderActions } from './PaymentOrderActions';
import { PaymentOrderStatusBadge } from './PaymentOrderStatusBadge';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const day = (value: string | null) => (value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '—');

const KIND_LABELS = {
  INVOICE: 'Comprobante',
  CREDIT_NOTE: 'Nota de crédito aplicada',
  ADVANCE: 'Anticipo',
  ADVANCE_APPLIED: 'Anticipo aplicado',
} as const;

/** Detalle de la orden de pago: lo que paga, retenciones con certificados, medios e historial. */
export function PaymentOrderDetailView({ order, accounts }: { order: PaymentOrderDetail; accounts: TreasuryAccountRow[] }) {
  const t = order.totals;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{order.number}</h1>
        <PaymentOrderStatusBadge status={order.status} />
        <div className="w-full sm:ml-auto sm:w-auto">
          <PaymentOrderActions order={order} accounts={accounts} />
        </div>
      </div>

      {order.rejectionNotes && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTitle>Rechazada</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{order.rejectionNotes}</AlertDescription>
        </Alert>
      )}
      {order.status === 'CANCELLED' && order.cancelReason && (
        <Alert variant="destructive">
          <AlertTitle>Anulada</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{order.cancelReason}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          </dl>
          {order.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{order.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qué se paga</CardTitle>
        </CardHeader>
        <CardContent>
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
                      <TableCell className={`text-right tabular-nums ${subtracts ? 'text-red-600 dark:text-red-400' : ''}`}>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retenciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
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
                  {w.manual && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">corregida</span>}
                  <span className="ml-auto font-medium tabular-nums">{formatMoney(w.amount)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{w.detail}</p>
              </div>
            ))
          )}
          {order.status === 'PAID' && order.withholdings.length > 0 && (
            <p className="text-xs text-muted-foreground">Los certificados van en el PDF de la orden, uno por hoja.</p>
          )}
        </CardContent>
      </Card>

      {order.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Medios de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {order.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="font-medium">{PAYMENT_METHOD_LABELS[p.method]}</span>
                  <span className="text-muted-foreground">{p.account.name}</span>
                  {p.reference && <span className="text-muted-foreground">Ref. {p.reference}</span>}
                  {p.checkNumber && (
                    <span className="text-muted-foreground">
                      N° {p.checkNumber}
                      {p.checkBank ? ` · ${p.checkBank}` : ''} · pago {day(p.checkDueOn)}
                    </span>
                  )}
                  {p.movement && !p.movement.cancelled && (
                    <span className="text-muted-foreground">Débito: {day(p.movement.date)}</span>
                  )}
                  {p.movement?.toDebit && !p.movement.cancelled && <Badge variant="outline">A debitar</Badge>}
                  <span className="ml-auto tabular-nums">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <HistoryCard history={order.history} />
    </div>
  );
}
