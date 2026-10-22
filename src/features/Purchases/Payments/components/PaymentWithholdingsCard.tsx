'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Loader2, Pencil, TriangleAlert, Undo2 } from 'lucide-react';
import type { previewPaymentOrder } from '../../actions/payment-orders.server';
import { WITHHOLDING_TAX_LABELS, type WithholdingTax } from '../../schemas/payment-settings';

type PreviewResult = Extract<Awaited<ReturnType<typeof previewPaymentOrder>>, { ok: true }>['data'];

type ManualDraft = { amount: string; reason: string };

interface PaymentWithholdingsCardProps {
  /** Vista previa del servidor (`useQuery`): retenciones calculadas y totales de la orden. */
  preview: { data: PreviewResult | undefined; isError: boolean; isFetching: boolean; error: unknown };
  editingTax: WithholdingTax | null;
  manualDraft: ManualDraft;
  onManualDraftChange: (draft: ManualDraft) => void;
  onEdit: (tax: WithholdingTax, amount: string) => void;
  onSaveManual: (tax: WithholdingTax) => void;
  onRemoveManual: (tax: WithholdingTax) => void;
}

/** Retenciones calculadas por el servidor (con corrección manual), y los totales y el neto a pagar. */
export function PaymentWithholdingsCard({
  preview,
  editingTax,
  manualDraft,
  onManualDraftChange,
  onEdit,
  onSaveManual,
  onRemoveManual,
}: PaymentWithholdingsCardProps) {
  const totals = preview.data?.totals;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Retenciones y neto a pagar</CardTitle>
        <CardDescription>
          Se calculan solas con la situación impositiva del proveedor. Podés corregir una indicando el motivo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {preview.isError && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>
              {preview.error instanceof Error ? preview.error.message : 'No se pudo calcular la orden'}
            </AlertDescription>
          </Alert>
        )}
        {preview.isFetching && !preview.data && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculando…
          </p>
        )}
        {preview.data && preview.data.withholdings.length === 0 && (
          <p className="text-sm text-muted-foreground">No corresponde retener.</p>
        )}
        {preview.data?.withholdings.map((w) => (
          <div key={w.tax} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{WITHHOLDING_TAX_LABELS[w.tax as WithholdingTax]}</span>
              {w.manual && (
                <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  corregida
                </span>
              )}
              <span className="ml-auto tabular-nums font-medium">{formatMoney(w.amount)}</span>
              {w.manual ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveManual(w.tax as WithholdingTax)}>
                  <Undo2 className="mr-1 h-4 w-4" />
                  Volver al cálculo
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(w.tax as WithholdingTax, w.amount)}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  Corregir
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{w.detail}</p>
            {editingTax === w.tax && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                <Input
                  aria-label="Importe corregido"
                  inputMode="decimal"
                  value={manualDraft.amount}
                  onChange={(e) => onManualDraftChange({ ...manualDraft, amount: e.target.value })}
                />
                <Input
                  aria-label="Motivo"
                  placeholder="Motivo (obligatorio)"
                  value={manualDraft.reason}
                  onChange={(e) => onManualDraftChange({ ...manualDraft, reason: e.target.value })}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!manualDraft.reason.trim()}
                  onClick={() => onSaveManual(w.tax as WithholdingTax)}
                >
                  Aplicar
                </Button>
              </div>
            )}
          </div>
        ))}
        {totals && (
          <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Comprobantes</dt>
            <dd className="text-right">{formatMoney(totals.invoicesTotal)}</dd>
            {Number(totals.advanceTotal) > 0 && (
              <>
                <dt className="text-muted-foreground">Anticipo</dt>
                <dd className="text-right">{formatMoney(totals.advanceTotal)}</dd>
              </>
            )}
            {Number(totals.creditsTotal) > 0 && (
              <>
                <dt className="text-muted-foreground">NC y anticipos aplicados</dt>
                <dd className="text-right">−{formatMoney(totals.creditsTotal)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Retenciones</dt>
            <dd className="text-right">−{formatMoney(totals.withholdingsTotal)}</dd>
            <dt className="text-base font-semibold">Neto a pagar</dt>
            <dd className="text-right text-base font-semibold">{formatMoney(totals.netTotal)}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
