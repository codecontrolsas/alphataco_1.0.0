'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import moment from 'moment';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { cancelCheckOperation, cancelOpeningCheck, type CheckDetail } from '../../actions/checks.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';
import { CHECK_KIND_LABELS, CHECK_STATUS_LABELS } from '../../lib/check-transitions';
import { DEPOSIT_WARNING_LABELS } from '../../lib/checks-dates';
import { formatInCurrency } from '../../lib/currency-format';
import { formatArgentinaDateTime } from '../../lib/today';
import { RETURNED_BY_LABELS } from '../../schemas/checks';
import { RejectCheckDialog } from './RejectCheckDialog';

const dmy = (value: string | null) => (value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '—');
const cuit = (value: string) => (value.length === 11 ? `${value.slice(0, 2)}-${value.slice(2, 10)}-${value.slice(10)}` : value);

const STATUS_BADGE: Record<CheckDetail['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  IN_PORTFOLIO: 'default',
  DEPOSITED: 'secondary',
  ENDORSED: 'secondary',
  DISCOUNTED: 'secondary',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
};

const OPERATION_LABELS: Record<string, string> = { DEPOSIT: 'depósito', DISCOUNT: 'descuento', REJECTION: 'rechazo' };

/** Detalle del cheque: datos, aviso de plazo, historial, deudas y acciones según su estado. */
export function CheckDetailView({ detail, can }: { detail: CheckDetail; can: { reject: boolean; cancel: boolean; collect: boolean } }) {
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canReject = can.reject && ['DEPOSITED', 'ENDORSED', 'DISCOUNTED'].includes(detail.status);
  const last = detail.lastOperation;
  const canCancelOpening = can.cancel && detail.status === 'IN_PORTFOLIO' && detail.fromOpening;
  const canCancelLast = can.cancel && last !== null;

  const destination = detail.bankAccount?.name ?? detail.supplier?.name ?? null;
  const facts: [string, ReactNode][] = [
    ['Tipo', CHECK_KIND_LABELS[detail.kind]],
    ['Importe', <span key="amount" className="font-semibold tabular-nums">{formatInCurrency(detail.amount, 'ARS')}</span>],
    ['Librador', `${detail.drawerName} · CUIT ${cuit(detail.drawerCuit)}`],
    ['Cliente', detail.customer.name],
    ['Emisión', dmy(detail.issueDate)],
    ['Fecha de pago', dmy(detail.paymentDate)],
    ['Vence para depositar', dmy(detail.depositDeadline)],
    ['Cartera', detail.portfolio.name],
    ...(destination ? ([['Destino', destination]] as [string, ReactNode][]) : []),
    ...(detail.creditedOn ? ([['Acreditación', dmy(detail.creditedOn)]] as [string, ReactNode][]) : []),
    [
      'Origen',
      detail.receipt ? (
        <Link key="origin" href={`/dashboard/treasury/receipts/${detail.receipt.id}`} className="underline underline-offset-2">
          Recibo {detail.receipt.number}
        </Link>
      ) : (
        'Carga inicial'
      ),
    ],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE[detail.status]}>{CHECK_STATUS_LABELS[detail.status]}</Badge>
            {detail.depositWarning !== 'OK' && (
              <Badge
                variant="outline"
                className={
                  detail.depositWarning === 'EXPIRED'
                    ? 'border-red-600 text-red-700 dark:border-red-400 dark:text-red-400'
                    : 'border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400'
                }
              >
                {DEPOSIT_WARNING_LABELS[detail.depositWarning]}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canReject && (
              <Button type="button" size="sm" variant="destructive" onClick={() => setRejecting(true)}>
                Registrar rechazo
              </Button>
            )}
            {canCancelLast && (
              <Button type="button" size="sm" variant="outline" onClick={() => setCancelling(true)}>
                Anular {OPERATION_LABELS[last.kind] ?? 'operación'} {last.number}
              </Button>
            )}
            {canCancelOpening && (
              <Button type="button" size="sm" variant="outline" onClick={() => setCancelling(true)}>
                Anular la carga inicial
              </Button>
            )}
            {detail.endorsement && detail.status === 'ENDORSED' && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/purchases/payments/${detail.endorsement.id}`}>Endosado en la {detail.endorsement.number}</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {last?.kind === 'REJECTION' && (
            <p className="mt-3 text-sm text-muted-foreground">
              Rechazo {last.number} del {dmy(last.date)}: {last.reason} (lo devolvió {last.returnedBy ? RETURNED_BY_LABELS[last.returnedBy].toLowerCase() : '—'}).
            </p>
          )}
          {last?.kind === 'DISCOUNT' && (
            <p className="mt-3 text-sm text-muted-foreground tabular-nums">
              Descuento {last.number} del {dmy(last.date)}: intereses {formatInCurrency(last.interest, 'ARS')}, comisión {formatInCurrency(last.fee, 'ARS')}.
            </p>
          )}
        </CardContent>
      </Card>

      {(detail.customerDebt || detail.supplierDebt) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deuda por el rechazo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {detail.customerDebt && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {detail.customer.name} debe <span className="font-semibold tabular-nums">{formatInCurrency(detail.customerDebt.pending, 'ARS')}</span>
                  {detail.customerDebt.reserved !== '0.00' && (
                    <span className="text-muted-foreground"> · {formatInCurrency(detail.customerDebt.reserved, 'ARS')} en un recibo en borrador</span>
                  )}
                </span>
                {can.collect && detail.customerDebt.pending !== '0.00' && (
                  <Button asChild size="sm">
                    <Link href={`/dashboard/treasury/receipts/new?customerId=${detail.customer.id}&checkId=${detail.id}`}>Cobrar</Link>
                  </Button>
                )}
              </div>
            )}
            {detail.supplierDebt && detail.supplier && (
              <p>
                Se le debe a {detail.supplier.name}{' '}
                <span className="font-semibold tabular-nums">{formatInCurrency(detail.supplierDebt.pending, 'ARS')}</span>
                <span className="text-muted-foreground"> · se paga con una orden de pago en Compras</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Registrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="tabular-nums">{dmy(e.date)}</TableCell>
                  <TableCell>
                    {e.fromStatus ? `${CHECK_STATUS_LABELS[e.fromStatus]} → ` : ''}
                    {CHECK_STATUS_LABELS[e.toStatus]}
                  </TableCell>
                  <TableCell>
                    {e.document?.href ? (
                      <Link href={e.document.href} className="underline underline-offset-2">
                        {e.document.label}
                      </Link>
                    ) : (
                      (e.document?.label ?? '—')
                    )}
                  </TableCell>
                  <TableCell>{e.user}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatArgentinaDateTime(e.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canReject && <RejectCheckDialog open={rejecting} onOpenChange={setRejecting} check={{ id: detail.id, number: detail.number, bank: detail.bank, status: detail.status }} />}
      {(canCancelLast || canCancelOpening) && (
        <CancelReasonDialog
          open={cancelling}
          onOpenChange={setCancelling}
          title={last ? `Anular ${OPERATION_LABELS[last.kind] ?? 'operación'} ${last.number}` : 'Anular la carga inicial del cheque'}
          description={
            last?.kind === 'REJECTION'
              ? 'El cheque vuelve al estado anterior al rechazo y se anulan sus movimientos.'
              : last
                ? 'Los cheques de la operación vuelven a la cartera y se anulan sus movimientos.'
                : 'El cheque queda anulado y sale de la cartera.'
          }
          successMessage="Anulado"
          run={(reason) => (last ? cancelCheckOperation(last.id, reason) : cancelOpeningCheck(detail.id, reason))}
        />
      )}
    </div>
  );
}
