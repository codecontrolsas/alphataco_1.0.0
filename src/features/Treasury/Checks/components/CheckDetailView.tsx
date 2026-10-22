'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { Timeline, type TimelineItem } from '@/shared/components/common/Timeline';
import { formatCuitText } from '@/shared/utils/cuit-text';
import Link from 'next/link';
import { useState } from 'react';
import { cancelCheckOperation, cancelOpeningCheck } from '../../actions/checks.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';
import { TreasuryStatusBadge } from '../../components/TreasuryStatusBadge';
import { CHECK_KIND_LABELS } from '../../lib/check-transitions';
import type { CheckDetail } from '../../lib/check-types';
import { formatInCurrency } from '../../lib/currency-format';
import { formatDay } from '../../lib/dates';
import { CHECK_STATUS_UI, DEPOSIT_WARNING_UI } from '../../lib/status-presentation';
import { formatArgentinaDateTime } from '../../lib/today';
import { RETURNED_BY_LABELS } from '../../schemas/checks';
import { RejectCheckDialog } from './RejectCheckDialog';

const dmy = (value: string | null) => formatDay(value) || '—';

const TIMELINE_TONE: Record<string, TimelineItem['tone']> = { danger: 'danger', warn: 'warn', ok: 'ok' };

const OPERATION_LABELS: Record<string, string> = { DEPOSIT: 'depósito', DISCOUNT: 'descuento', REJECTION: 'rechazo' };

/** Detalle del cheque: datos, aviso de plazo, historial, deudas y acciones según su estado. */
export function CheckDetailView({
  detail,
  can,
}: {
  detail: CheckDetail;
  can: { reject: boolean; cancel: boolean; collect: boolean };
}) {
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canReject = can.reject && ['DEPOSITED', 'ENDORSED', 'DISCOUNTED'].includes(detail.status);
  const last = detail.lastOperation;
  const canCancelOpening = can.cancel && detail.status === 'IN_PORTFOLIO' && detail.fromOpening;
  const canCancelLast = can.cancel && last !== null;

  const destination = detail.bankAccount?.name ?? detail.supplier?.name ?? null;
  const warning = detail.depositWarning !== 'OK' ? DEPOSIT_WARNING_UI[detail.depositWarning] : null;

  const timeline: TimelineItem[] = detail.events.map((e) => {
    const ui = CHECK_STATUS_UI[e.toStatus];
    return {
      tone: TIMELINE_TONE[ui.tone] ?? 'brand',
      title: `${e.fromStatus ? `${CHECK_STATUS_UI[e.fromStatus].label} → ` : ''}${ui.label}`,
      meta: (
        <>
          <span className="tabular-nums">{dmy(e.date)}</span>
          {e.user ? ` · ${e.user}` : ''} · registrado{' '}
          <span className="tabular-nums">{formatArgentinaDateTime(e.createdAt)}</span>
        </>
      ),
      children: e.document ? (
        <p className="text-sm">
          {e.document.href ? (
            <Link href={e.document.href} className="underline underline-offset-2">
              {e.document.label}
            </Link>
          ) : (
            e.document.label
          )}
        </p>
      ) : null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RecordHeader
        identity={
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">
              Cheque Nº {detail.number} · {detail.bank}
            </h1>
            <TreasuryStatusBadge ui={CHECK_STATUS_UI[detail.status]} />
          </div>
        }
        actions={
          <>
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
                <Link href={`/dashboard/purchases/payments/${detail.endorsement.id}`}>
                  Endosado en la {detail.endorsement.number}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {warning && <AttentionBanner tone={warning.tone === 'danger' ? 'danger' : 'warn'} title={warning.label} />}

      <SectionCard title="Datos del cheque">
        <FieldGrid>
          <Field label="Tipo" value={CHECK_KIND_LABELS[detail.kind]} />
          <Field label="Importe">
            <span className="tabular-nums">{formatInCurrency(detail.amount, 'ARS')}</span>
          </Field>
          <Field label="Librador" value={`${detail.drawerName} · CUIT ${formatCuitText(detail.drawerCuit)}`} />
          <Field label="Cliente" value={detail.customer.name} />
          <Field label="Emisión" value={dmy(detail.issueDate)} mono />
          <Field label="Fecha de pago" value={dmy(detail.paymentDate)} mono />
          <Field label="Vence para depositar" value={dmy(detail.depositDeadline)} mono />
          <Field label="Cartera" value={detail.portfolio.name} />
          {destination && <Field label="Destino" value={destination} />}
          {detail.creditedOn && <Field label="Acreditación" value={dmy(detail.creditedOn)} mono />}
          <Field label="Origen">
            {detail.receipt ? (
              <Link href={`/dashboard/treasury/receipts/${detail.receipt.id}`} className="underline underline-offset-2">
                Recibo {detail.receipt.number}
              </Link>
            ) : (
              'Carga inicial'
            )}
          </Field>
        </FieldGrid>
        {last?.kind === 'REJECTION' && (
          <p className="mt-4 text-sm text-muted-foreground">
            Rechazo {last.number} del {dmy(last.date)}: {last.reason} (lo devolvió{' '}
            {last.returnedBy ? RETURNED_BY_LABELS[last.returnedBy].toLowerCase() : '—'}).
          </p>
        )}
        {last?.kind === 'DISCOUNT' && (
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            Descuento {last.number} del {dmy(last.date)}: intereses {formatInCurrency(last.interest, 'ARS')}, comisión{' '}
            {formatInCurrency(last.fee, 'ARS')}.
          </p>
        )}
      </SectionCard>

      {(detail.customerDebt || detail.supplierDebt) && (
        <SectionCard title="Deuda por el rechazo">
          <div className="space-y-2 text-sm">
            {detail.customerDebt && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {detail.customer.name} debe{' '}
                  <span className="font-semibold tabular-nums">
                    {formatInCurrency(detail.customerDebt.pending, 'ARS')}
                  </span>
                  {detail.customerDebt.reserved !== '0.00' && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatInCurrency(detail.customerDebt.reserved, 'ARS')} en un recibo en borrador
                    </span>
                  )}
                </span>
                {can.collect && detail.customerDebt.pending !== '0.00' && (
                  <Button asChild size="sm">
                    <Link
                      href={`/dashboard/treasury/receipts/new?customerId=${detail.customer.id}&checkId=${detail.id}`}
                    >
                      Cobrar
                    </Link>
                  </Button>
                )}
              </div>
            )}
            {detail.supplierDebt && detail.supplier && (
              <p>
                Se le debe a {detail.supplier.name}{' '}
                <span className="font-semibold tabular-nums">
                  {formatInCurrency(detail.supplierDebt.pending, 'ARS')}
                </span>
                <span className="text-muted-foreground"> · se paga con una orden de pago en Compras</span>
              </p>
            )}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Historial">
        {timeline.length > 0 ? (
          <Timeline items={timeline} />
        ) : (
          <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
        )}
      </SectionCard>

      {canReject && (
        <RejectCheckDialog
          open={rejecting}
          onOpenChange={setRejecting}
          check={{ id: detail.id, number: detail.number, bank: detail.bank, status: detail.status }}
        />
      )}
      {(canCancelLast || canCancelOpening) && (
        <CancelReasonDialog
          open={cancelling}
          onOpenChange={setCancelling}
          title={
            last
              ? `Anular ${OPERATION_LABELS[last.kind] ?? 'operación'} ${last.number}`
              : 'Anular la carga inicial del cheque'
          }
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
