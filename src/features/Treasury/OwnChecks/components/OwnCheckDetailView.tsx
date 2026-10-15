'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { Timeline, type TimelineItem } from '@/shared/components/common/Timeline';
import Link from 'next/link';
import { useState } from 'react';
import { undoOwnCheckDebit, undoOwnCheckRejection, type OwnCheckDetail } from '../../actions/own-checks.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';
import { TreasuryStatusBadge } from '../../components/TreasuryStatusBadge';
import { formatInCurrency } from '../../lib/currency-format';
import { formatDay } from '../../lib/dates';
import { OWN_CHECK_KIND_LABELS } from '../../lib/own-check-transitions';
import { OWN_CHECK_ALERT_UI, OWN_CHECK_STATUS_UI } from '../../lib/status-presentation';
import { formatArgentinaDateTime } from '../../lib/today';
import { DebitOwnChecksDialog } from './DebitOwnChecksDialog';
import { RejectOwnCheckDialog } from './RejectOwnCheckDialog';

const dmy = (value: string | null) => formatDay(value) || '—';

const TIMELINE_TONE: Record<string, TimelineItem['tone']> = { danger: 'danger', warn: 'warn', ok: 'ok' };

type Dialogs = 'debit' | 'undo-debit' | 'reject' | 'undo-rejection' | null;

/** Detalle del cheque propio: datos, aviso, historial, deuda y acciones según su estado (spec Tesorería etapa 3b §4.3). */
export function OwnCheckDetailView({ detail, can }: { detail: OwnCheckDetail; can: { update: boolean; delete: boolean } }) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = (open: boolean) => !open && setDialog(null);
  const voided = detail.voidReason !== null;
  const pending = detail.paymentDate !== null && detail.paymentDate > detail.today;

  const alert = detail.alert === 'PENDING_CONFIRMATION' ? OWN_CHECK_ALERT_UI.PENDING_CONFIRMATION : null;

  const timeline: TimelineItem[] = detail.events.map((e) => {
    const ui = OWN_CHECK_STATUS_UI[e.toStatus];
    return {
      tone: TIMELINE_TONE[ui.tone] ?? 'brand',
      title: `${e.fromStatus ? `${OWN_CHECK_STATUS_UI[e.fromStatus].label} → ` : ''}${ui.label}`,
      meta: (
        <>
          <span className="tabular-nums">{dmy(e.date)}</span>
          {e.user ? ` · ${e.user}` : ''} · registrado <span className="tabular-nums">{formatArgentinaDateTime(e.createdAt)}</span>
        </>
      ),
      children:
        e.paymentOrder || e.reason ? (
          <p className="text-sm">
            {e.paymentOrder && (
              <Link href={`/dashboard/purchases/payments/${e.paymentOrder.id}`} className="underline underline-offset-2">
                {e.paymentOrder.number}
              </Link>
            )}
            {e.paymentOrder && e.reason ? ' · ' : null}
            {e.reason}
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
              {OWN_CHECK_KIND_LABELS[detail.kind]} propio Nº {detail.number} · {detail.account.name}
            </h1>
            <TreasuryStatusBadge ui={OWN_CHECK_STATUS_UI[detail.status]} />
          </div>
        }
        actions={
          <>
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
          </>
        }
      />

      {alert && <AttentionBanner tone="warn" title={alert.label} />}

      <SectionCard title="Datos del cheque">
        <FieldGrid>
          <Field label="Tipo" value={OWN_CHECK_KIND_LABELS[detail.kind]} />
          {detail.amount && (
            <Field label="Importe">
              <span className="tabular-nums">{formatInCurrency(detail.amount, 'ARS')}</span>
            </Field>
          )}
          <Field label="Cuenta" value={detail.account.name} />
          {detail.checkbook && <Field label="Chequera" value={`Del ${detail.checkbook.range}`} />}
          {detail.supplier && <Field label="Proveedor" value={detail.supplier.name} />}
          <Field label={voided ? 'Inutilizado' : 'Emisión'} value={dmy(detail.issueDate)} mono />
          {detail.paymentDate && <Field label="Fecha de pago" value={dmy(detail.paymentDate)} mono />}
          {detail.debitedOn && <Field label="Débito" value={dmy(detail.debitedOn)} mono />}
          {detail.paymentOrder && (
            <Field label="Orden de pago">
              <Link href={`/dashboard/purchases/payments/${detail.paymentOrder.id}`} className="underline underline-offset-2">
                {detail.paymentOrder.number}
              </Link>
            </Field>
          )}
        </FieldGrid>
        {detail.status === 'REJECTED' && (
          <p className="mt-4 text-sm text-muted-foreground">
            Rechazado el {dmy(detail.rejectedOn)}: {detail.rejectReason}
          </p>
        )}
        {voided && <p className="mt-4 text-sm text-muted-foreground">Número inutilizado: {detail.voidReason}</p>}
      </SectionCard>

      {detail.debt && (
        <SectionCard title="Deuda por el rechazo">
          <p className="text-sm">
            Se le debe a {detail.supplier?.name ?? 'el proveedor'}{' '}
            <span className="font-semibold tabular-nums">{formatInCurrency(detail.debt.pending, 'ARS')}</span>
            {detail.debt.reserved !== '0.00' && (
              <span className="text-muted-foreground"> · {formatInCurrency(detail.debt.reserved, 'ARS')} en una orden sin pagar</span>
            )}
            <span className="text-muted-foreground"> · se paga con una orden de pago en Compras</span>
          </p>
        </SectionCard>
      )}

      <SectionCard title="Historial">
        {timeline.length > 0 ? <Timeline items={timeline} /> : <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>}
      </SectionCard>

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
