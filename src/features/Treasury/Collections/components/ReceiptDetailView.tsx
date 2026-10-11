'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DownloadPdfButton } from '@/features/Purchases/components/DownloadPdfButton';
import { PAYMENT_METHOD_LABELS } from '@/features/Purchases/schemas/payment-orders';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, FileText } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { cancelReceipt, getReceiptPdf, type ReceiptDetail } from '../../actions/receipts.server';
import { attachWithholdingCertificate } from '../../actions/withholdings.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';
import { formatInCurrency } from '../../lib/currency-format';
import { invalidateTreasury } from '../../lib/invalidate';
import { RECEIPT_STATUS_LABELS } from '../../lib/receipt-rules';
import { CERTIFICATE_MAX_BYTES, CUSTOMER_WITHHOLDING_TAX_LABELS } from '../../schemas/receipts';
import { SendReceiptDialog } from './SendReceiptDialog';

const dmy = (value: string) => moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');
const dateTime = (value: string) => moment(value).format('DD/MM/YYYY HH:mm');
const pesos = (value: string) => formatInCurrency(value, 'ARS');

const STATUS_BADGE: Record<ReceiptDetail['status'], 'default' | 'secondary' | 'destructive'> = {
  DRAFT: 'secondary',
  CONFIRMED: 'default',
  CANCELLED: 'destructive',
};

/**
 * Detalle de un recibo confirmado o anulado (spec Tesorería etapa 2 §4.4): qué cobró, las
 * retenciones con su certificado, los medios con su movimiento y las acciones (PDF, envío,
 * anulación, adjuntar certificado).
 */
export function ReceiptDetailView({ detail, can }: { detail: ReceiptDetail; can: { update: boolean; delete: boolean; attach: boolean } }) {
  const [cancelling, setCancelling] = useState(false);
  const confirmed = detail.status === 'CONFIRMED';
  const label = detail.number ?? 'el borrador';

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 pt-6">
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_BADGE[detail.status]}>{RECEIPT_STATUS_LABELS[detail.status]}</Badge>
              <span className="text-muted-foreground">Fecha del cobro {dmy(detail.date)}</span>
            </div>
            <p>
              <Link href={`/dashboard/treasury/customers/${detail.customer.id}`} className="font-medium underline underline-offset-4">
                {detail.customer.name}
              </Link>{' '}
              <span className="text-muted-foreground">· CUIT {detail.customer.cuit}</span>
            </p>
            {detail.confirmedAt && (
              <p className="text-muted-foreground">
                Confirmado {dateTime(detail.confirmedAt)}
                {detail.confirmedBy ? ` por ${detail.confirmedBy}` : ''}
              </p>
            )}
            {detail.sentAt && (
              <p className="text-muted-foreground">
                Enviado {dateTime(detail.sentAt)} a {detail.sentTo.join(', ')}
              </p>
            )}
            {detail.status === 'CANCELLED' && (
              <p className="text-red-600 dark:text-red-400">
                Anulado {detail.cancelledAt ? dateTime(detail.cancelledAt) : ''}
                {detail.cancelledBy ? ` por ${detail.cancelledBy}` : ''}: {detail.cancelReason}
              </p>
            )}
            {detail.notes && <p className="text-muted-foreground">{detail.notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.number && <DownloadPdfButton load={() => getReceiptPdf(detail.id)} />}
            {confirmed && can.update && (
              <SendReceiptDialog receiptId={detail.id} number={detail.number ?? ''} defaultEmail={detail.customer.email} />
            )}
            {confirmed && can.delete && (
              <Button type="button" size="sm" variant="destructive" onClick={() => setCancelling(true)}>
                <Ban className="mr-1 h-4 w-4" />
                Anular
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qué se cobró</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead>Moneda de origen</TableHead>
                <TableHead className="text-right">Pesos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.invoice ? (
                      <Link href={`/dashboard/comercial/facturacion/${l.invoice.id}`} className="underline underline-offset-4">
                        {l.invoice.label}
                      </Link>
                    ) : l.kind === 'ADVANCE' ? (
                      `Cobro a cuenta${l.description ? ` · ${l.description}` : ''}`
                    ) : (
                      <>
                        Anticipo aplicado ·{' '}
                        {l.sourceReceipt ? (
                          <Link href={`/dashboard/treasury/receipts/${l.sourceReceipt.id}`} className="underline underline-offset-4">
                            {l.sourceReceipt.number}
                          </Link>
                        ) : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {l.currency === 'ARS' ? '—' : `${formatInCurrency(l.applied, l.currency)} a ${Number(l.rate).toLocaleString('es-AR')}`}
                    {l.fxDifference !== '0.00' && ` · dif. de cambio ${pesos(l.fxDifference)}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.kind === 'ADVANCE_APPLIED' ? `−${pesos(l.ars)}` : pesos(l.ars)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <dl className="ml-auto mt-4 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Comprobantes</dt>
            <dd className="text-right">{pesos(detail.totals.invoices)}</dd>
            {detail.totals.advance !== '0.00' && (
              <>
                <dt className="text-muted-foreground">Cobro a cuenta</dt>
                <dd className="text-right">{pesos(detail.totals.advance)}</dd>
              </>
            )}
            {detail.totals.advancesApplied !== '0.00' && (
              <>
                <dt className="text-muted-foreground">Anticipos aplicados</dt>
                <dd className="text-right">−{pesos(detail.totals.advancesApplied)}</dd>
              </>
            )}
            {detail.totals.withholdings !== '0.00' && (
              <>
                <dt className="text-muted-foreground">Retenciones</dt>
                <dd className="text-right">−{pesos(detail.totals.withholdings)}</dd>
              </>
            )}
            <dt className="font-semibold">Recibido</dt>
            <dd className="text-right font-semibold">{pesos(detail.totals.received)}</dd>
            {detail.totals.fxDifference !== '0.00' && (
              <>
                <dt className="text-muted-foreground">Diferencia de cambio (informativa)</dt>
                <dd className="text-right">{pesos(detail.totals.fxDifference)}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {detail.withholdings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retenciones sufridas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Impuesto</TableHead>
                  <TableHead>Certificado</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.withholdings.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      {CUSTOMER_WITHHOLDING_TAX_LABELS[w.tax]}
                      {w.jurisdiction ? ` ${w.jurisdiction}` : ''}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {w.certificateNumber} · {dmy(w.certificateDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(w.amount)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {w.file ? (
                          <a href={w.file.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                            Ver
                          </a>
                        ) : (
                          <Badge variant="outline">Sin certificado</Badge>
                        )}
                        {can.attach && detail.status !== 'CANCELLED' && <AttachCertificateButton withholdingId={w.id} replace={Boolean(w.file)} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {detail.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Medios</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medio</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Acreditación</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/treasury/accounts/${p.account.id}`} className="underline underline-offset-4">
                        {p.account.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[p.reference, p.checkNumber ? `N° ${p.checkNumber}` : null, p.checkBank].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell>
                      {p.movement ? (
                        <span className="flex flex-wrap items-center gap-2 tabular-nums">
                          {dmy(p.movement.date)}
                          {p.movement.cancelled ? <Badge variant="outline">Anulado</Badge> : p.movement.future ? <Badge variant="secondary">A acreditar</Badge> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CancelReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`¿Anular ${label}?`}
        description="Anula sus movimientos en las cuentas y libera los comprobantes y anticipos que cancelaba. El número no se reusa."
        successMessage={`${label} anulado`}
        run={(reason) => cancelReceipt(detail.id, reason)}
      />
    </div>
  );
}

/** Adjunta o reemplaza el PDF del certificado de una retención. */
function AttachCertificateButton({ withholdingId, replace }: { withholdingId: string; replace: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = new FormData();
      data.set('file', file);
      return unwrapAction(await attachWithholdingCertificate(withholdingId, data));
    },
    onSuccess: () => {
      toast.success('Certificado guardado');
      invalidateTreasury(queryClient);
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar el certificado'),
  });

  return (
    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
      <FileText className="h-3.5 w-3.5" />
      {upload.isPending ? 'Subiendo…' : replace ? 'Reemplazar' : 'Adjuntar'}
      <input
        type="file"
        accept="application/pdf"
        className="sr-only"
        disabled={upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.type !== 'application/pdf') return void toast.error('El certificado tiene que ser un PDF');
          if (file.size > CERTIFICATE_MAX_BYTES) return void toast.error('El archivo supera los 10 MB');
          upload.mutate(file);
        }}
      />
    </label>
  );
}

