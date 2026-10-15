'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CertificationAmount } from '@/features/Comercial/Certificaciones/components/CertificationAmount';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { formatAmountText } from '@/shared/utils/amount-text';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import moment from 'moment';
import { useRef, useState } from 'react';
import { issueInvoiceAction, previewInvoiceIssue } from '../../actions/invoice-emission.server';
import type { EmissionOutcome } from '../../lib/emission.server';
import { countLabel } from '../../utils/invoice-links';

const logger = new Logger('features/Comercial/Facturacion/IssueInvoiceDialog');

/** A partir de este tiempo se avisa que ARCA tarda (la emisión puede tardar hasta ~60 s). */
const SLOW_NOTICE_MS = 8000;

/** Clases completas por ambiente (Tailwind v4). Mismo criterio que el badge de ambiente de Datos fiscales. */
const ENVIRONMENT_STYLES = {
  homologacion: 'border-warn/50 text-warn-subtle-foreground',
  produccion: 'bg-foreground text-background',
} as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  /** Cambia con cada guardado: la consulta del número esperado se vuelve a hacer. */
  version: string;
  issueDate: string;
  certificationsCount: number;
  /** "Asociada a Factura A 00003-00000124" (NC/ND). */
  associatedLabel: string | null;
  onOutcome: (outcome: EmissionOutcome | { status: 'failed'; message: string }) => void;
};

/**
 * Emisión ante ARCA: UN solo diálogo que cambia en el lugar (confirmación → enviando). No abre un
 * segundo modal; al terminar se cierra y el resultado queda en la página.
 *
 * - Al abrirse consulta a ARCA el número que va a tomar. Si esa consulta falla no se ofrece emitir:
 *   un certificado roto se detecta antes de confirmar.
 * - Foco inicial en Cancelar (lo hace el AlertDialog de Radix): la acción es irreversible.
 * - Mientras envía no se cierra ni con Esc ni con Cancelar.
 */
export function IssueInvoiceDialog({
  open,
  onOpenChange,
  invoiceId,
  version,
  issueDate,
  certificationsCount,
  associatedLabel,
  onOutcome,
}: Props) {
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guarda sincrónica contra el doble click (el estado `sending` recién se ve en el próximo render).
  const inFlight = useRef(false);

  const preview = useQuery({
    queryKey: ['invoice-issue-preview', invoiceId, version],
    queryFn: async () => {
      const result = await previewInvoiceIssue(invoiceId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const handleOpenChange = (next: boolean) => {
    if (sending) return;
    onOpenChange(next);
  };

  const confirm = async () => {
    if (inFlight.current || !preview.data) return;
    inFlight.current = true;
    setSending(true);
    setSlow(false);
    slowTimer.current = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
    try {
      const result = await issueInvoiceAction(invoiceId);
      onOutcome(result.ok ? result.data : { status: 'failed', message: result.error });
    } catch (error) {
      logger.error('Falló la llamada de emisión', { data: { error, invoiceId } });
      onOutcome({
        status: 'failed',
        message:
          'Se cortó la comunicación con el servidor. Puede que la emisión haya llegado a ARCA: actualizá la página antes de volver a emitir.',
      });
    } finally {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      inFlight.current = false;
      setSending(false);
      setSlow(false);
    }
  };

  const data = preview.data;
  const title = data ? `¿Emitir ${data.label} ${data.expectedNumber}?` : '¿Emitir el comprobante?';

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (sending) event.preventDefault();
        }}
        // El foco lo maneja la página (va al resultado): no se devuelve al botón Emitir.
        onCloseAutoFocus={(event) => event.preventDefault()}
        aria-busy={sending}
      >
        {sending ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Enviando a ARCA…</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div role="status" className="flex flex-col gap-3">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {data
                      ? `${data.label} por ${data.currency} ${formatAmountText(data.total)}`
                      : 'Emitiendo el comprobante'}
                  </span>
                  {slow && (
                    <span className="text-pretty">
                      ARCA está tardando más de lo habitual. No cierres esta pestaña; si no responde, el comprobante
                      queda pendiente y lo podés consultar después.
                    </span>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-balance tabular-nums">{title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-4">
                  {preview.isPending ? (
                    <div className="flex flex-col gap-2" aria-busy="true">
                      <span>Consultando a ARCA el próximo número…</span>
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : preview.isError ? (
                    <div role="alert" className="text-destructive flex flex-col gap-1">
                      <span className="text-pretty">No se pudo consultar a ARCA. No se envió nada.</span>
                      <span className="text-pretty break-words">{preview.error.message}</span>
                    </div>
                  ) : data ? (
                    <>
                      <span>
                        <Badge
                          variant="outline"
                          className={cn('whitespace-nowrap', ENVIRONMENT_STYLES[data.environment])}
                        >
                          {data.simulated
                            ? 'ARCA simulado · sin validez fiscal'
                            : data.environment === 'homologacion'
                              ? 'Homologación · sin validez fiscal'
                              : 'Producción · con validez fiscal'}
                        </Badge>
                      </span>
                      <dl className="text-foreground grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">Cliente</dt>
                        <dd className="break-words">{data.customer}</dd>
                        <dt className="text-muted-foreground">Fecha</dt>
                        <dd className="tabular-nums">{moment(issueDate).format('DD/MM/YYYY')}</dd>
                        <dt className="text-muted-foreground">Total</dt>
                        <dd className="font-semibold">
                          <CertificationAmount value={data.total} currency={data.currency} />
                        </dd>
                        {certificationsCount > 0 && (
                          <>
                            <dt className="text-muted-foreground">Incluye</dt>
                            <dd>{countLabel(certificationsCount, 'certificación', 'certificaciones')}</dd>
                          </>
                        )}
                        {associatedLabel && (
                          <>
                            <dt className="text-muted-foreground">Asociada a</dt>
                            <dd className="tabular-nums">{associatedLabel}</dd>
                          </>
                        )}
                      </dl>
                      <span className="text-pretty">
                        Una vez autorizado no se puede modificar ni borrar. Para corregirlo vas a tener que emitir una
                        nota de crédito. El número es el que informa ARCA ahora: si alguien emite antes, se toma el
                        siguiente.
                      </span>
                    </>
                  ) : null}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              {preview.isError ? (
                <Button type="button" variant="outline" onClick={() => void preview.refetch()}>
                  <RefreshCw aria-hidden />
                  Reintentar
                </Button>
              ) : (
                <Button type="button" variant="brand" disabled={!data} onClick={() => void confirm()}>
                  {data ? `Emitir ${data.label} por ${data.currency} ${formatAmountText(data.total)}` : 'Emitir'}
                </Button>
              )}
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
