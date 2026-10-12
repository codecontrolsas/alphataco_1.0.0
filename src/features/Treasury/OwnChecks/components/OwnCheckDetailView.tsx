'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import moment from 'moment';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { undoOwnCheckDebit, undoOwnCheckRejection, type OwnCheckDetail } from '../../actions/own-checks.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';
import { formatInCurrency } from '../../lib/currency-format';
import { OWN_CHECK_ALERT_LABEL, OWN_CHECK_KIND_LABELS, OWN_CHECK_STATUS_LABELS } from '../../lib/own-check-transitions';
import { formatArgentinaDateTime } from '../../lib/today';
import { DebitOwnChecksDialog } from './DebitOwnChecksDialog';
import { RejectOwnCheckDialog } from './RejectOwnCheckDialog';

const dmy = (value: string | null) => (value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : '—');

const STATUS_BADGE: Record<OwnCheckDetail['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ISSUED: 'default',
  DEBITED: 'secondary',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
};

type Dialogs = 'debit' | 'undo-debit' | 'reject' | 'undo-rejection' | null;

/** Detalle del cheque propio: datos, aviso, historial, deuda y acciones según su estado (spec Tesorería etapa 3b §4.3). */
export function OwnCheckDetailView({ detail, can }: { detail: OwnCheckDetail; can: { update: boolean; delete: boolean } }) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = (open: boolean) => !open && setDialog(null);
  const voided = detail.voidReason !== null;
  const pending = detail.paymentDate !== null && detail.paymentDate > detail.today;

  const facts: [string, ReactNode][] = [
    ['Tipo', OWN_CHECK_KIND_LABELS[detail.kind]],
    ...(detail.amount
      ? ([['Importe', <span key="amount" className="font-semibold tabular-nums">{formatInCurrency(detail.amount, 'ARS')}</span>]] as [string, ReactNode][])
      : []),
    ['Cuenta', detail.account.name],
    ...(detail.checkbook ? ([['Chequera', `Del ${detail.checkbook.range}`]] as [string, ReactNode][]) : []),
    ...(detail.supplier ? ([['Proveedor', detail.supplier.name]] as [string, ReactNode][]) : []),
    [voided ? 'Inutilizado' : 'Emisión', dmy(detail.issueDate)],
    ...(detail.paymentDate ? ([['Fecha de pago', dmy(detail.paymentDate)]] as [string, ReactNode][]) : []),
    ...(detail.debitedOn ? ([['Débito', dmy(detail.debitedOn)]] as [string, ReactNode][]) : []),
    ...(detail.paymentOrder
      ? ([
          [
            'Orden de pago',
            <Link key="order" href={`/dashboard/purchases/payments/${detail.paymentOrder.id}`} className="underline underline-offset-2">
              {detail.paymentOrder.number}
            </Link>,
          ],
        ] as [string, ReactNode][])
      : []),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE[detail.status]}>{OWN_CHECK_STATUS_LABELS[detail.status]}</Badge>
            {detail.alert === 'PENDING_CONFIRMATION' && (
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                {OWN_CHECK_ALERT_LABEL}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {can.update && detail.status === 'ISSUED' && (
              <>
                <Button type="button" size="sm" onClick={() => setDialog('debit')} disabled={pending} title={pending ? 'Todavía no llegó su fecha de pago' : undefined}>
                  Confirmar débito
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => setDialog('reject')}>
                  Registrar rechazo
                </Button>
              </>
            )}
            {can.delete && detail.status === 'DEBITED' && (
              <Button type="button" size="sm" variant="outline" onClick={() => setDialog('undo-debit')}>
                Deshacer el débito
              </Button>
            )}
            {can.delete && detail.status === 'REJECTED' && (
              <Button type="button" size="sm" variant="outline" onClick={() => setDialog('undo-rejection')}>
                Anular el rechazo
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
          {detail.status === 'REJECTED' && (
            <p className="mt-3 text-sm text-muted-foreground">
              Rechazado el {dmy(detail.rejectedOn)}: {detail.rejectReason}
            </p>
          )}
          {voided && <p className="mt-3 text-sm text-muted-foreground">Número inutilizado: {detail.voidReason}</p>}
        </CardContent>
      </Card>

      {detail.debt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deuda por el rechazo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              Se le debe a {detail.supplier?.name ?? 'el proveedor'}{' '}
              <span className="font-semibold tabular-nums">{formatInCurrency(detail.debt.pending, 'ARS')}</span>
              {detail.debt.reserved !== '0.00' && (
                <span className="text-muted-foreground"> · {formatInCurrency(detail.debt.reserved, 'ARS')} en una orden sin pagar</span>
              )}
              <span className="text-muted-foreground"> · se paga con una orden de pago en Compras</span>
            </p>
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
                <TableHead>Documento o motivo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Registrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="tabular-nums">{dmy(e.date)}</TableCell>
                  <TableCell>
                    {e.fromStatus ? `${OWN_CHECK_STATUS_LABELS[e.fromStatus]} → ` : ''}
                    {OWN_CHECK_STATUS_LABELS[e.toStatus]}
                  </TableCell>
                  <TableCell>
                    {e.paymentOrder ? (
                      <Link href={`/dashboard/purchases/payments/${e.paymentOrder.id}`} className="underline underline-offset-2">
                        {e.paymentOrder.number}
                      </Link>
                    ) : null}
                    {e.paymentOrder && e.reason ? ' · ' : null}
                    {e.reason}
                    {!e.paymentOrder && !e.reason ? '—' : null}
                  </TableCell>
                  <TableCell>{e.user}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatArgentinaDateTime(e.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dialog === 'debit' && detail.amount && (
        <DebitOwnChecksDialog
          open
          onOpenChange={close}
          checks={[{ id: detail.id, number: detail.number, amount: detail.amount, paymentDate: detail.paymentDate, accountName: detail.account.name }]}
        />
      )}
      {dialog === 'reject' && (
        <RejectOwnCheckDialog open onOpenChange={close} check={{ id: detail.id, number: detail.number, supplierName: detail.supplier?.name ?? null }} />
      )}
      {dialog === 'undo-debit' && (
        <CancelReasonDialog
          open
          onOpenChange={close}
          title={`Deshacer el débito del cheque Nº ${detail.number}`}
          description="Se anula el movimiento del banco y el cheque vuelve a emitido. Usalo si el débito se marcó por error."
          successMessage="Débito deshecho"
          confirmLabel="Deshacer el débito"
          run={(reason) => undoOwnCheckDebit(detail.id, reason)}
        />
      )}
      {dialog === 'undo-rejection' && (
        <CancelReasonDialog
          open
          onOpenChange={close}
          title={`Anular el rechazo del cheque Nº ${detail.number}`}
          description="El cheque vuelve a emitido y desaparece la deuda con el proveedor. No se puede si la deuda ya está en una orden de pago."
          successMessage="Rechazo anulado"
          confirmLabel="Anular el rechazo"
          run={(reason) => undoOwnCheckRejection(detail.id, reason)}
        />
      )}
    </div>
  );
}
