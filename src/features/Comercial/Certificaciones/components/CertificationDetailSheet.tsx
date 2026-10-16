'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DownloadPdfButton } from '@/shared/components/common/DownloadPdfButton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  confirmCertification,
  deleteCertification,
  getCertificationById,
  getCertificationPdf,
  issueCertification,
  refreshCertificationLines,
  voidCertification,
} from '../actions/certifications.server';
import type { CertificationPermissions } from '../lib/permissions';
import { CERTIFICATIONS_QUERY_KEY, certificationDetailQueryKey } from '../lib/query-keys';
import { isDeletable, isEditable } from '../lib/state-machine';
import { CertificationAmount } from './CertificationAmount';
import { CertificationInvoicesNote } from './CertificationInvoicesNote';
import { CertificationStatusBadge } from './CertificationStatusBadge';
import { VoidCertificationDialog } from './VoidCertificationDialog';

interface CertificationDetailSheetProps {
  certificationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions: CertificationPermissions;
}

type ActionOutcome = { ok: true; data: unknown } | { ok: false; error: string };

const formatDay = (value: string | Date) => moment.utc(value).format('DD/MM/YYYY');

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Cargando certificación">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

/**
 * Detalle de una certificación en un panel lateral, con el circuito de estados. Los datos se piden con
 * `useQuery` y se invalidan tras cada transición (emitir, confirmar, anular, eliminar, recalcular).
 * Qué botón aparece lo decide la máquina de estados; el permiso decide si se dibuja.
 */
export function CertificationDetailSheet({
  certificationId,
  open,
  onOpenChange,
  permissions,
}: CertificationDetailSheetProps) {
  const queryClient = useQueryClient();
  const [voiding, setVoiding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { canUpdate, canApprove, canDelete, canViewPrices } = permissions;

  const detail = useQuery({
    queryKey: certificationDetailQueryKey(certificationId),
    queryFn: () => getCertificationById(certificationId),
    enabled: open,
  });

  const cert = detail.data ?? null;

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: certificationDetailQueryKey(certificationId) }),
      queryClient.invalidateQueries({ queryKey: CERTIFICATIONS_QUERY_KEY }),
    ]);

  const transition = useMutation({
    mutationFn: async ({ run }: { run: () => Promise<ActionOutcome>; success: string; afterClose?: boolean }) => {
      const result = await run();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      toast.success(variables.success);
      await refreshAll();
      if (variables.afterClose) onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pending = transition.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-2xl">
        <header className="flex items-start gap-3 border-b p-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <SheetTitle className="flex flex-wrap items-center gap-3 text-lg leading-snug">
              <span className="font-mono">{cert?.number ?? 'Certificación'}</span>
              {cert ? <CertificationStatusBadge status={cert.status} /> : null}
            </SheetTitle>
            <SheetDescription className="text-sm break-words [overflow-wrap:anywhere]">
              {cert
                ? `${cert.customers.name} · ${cert.customer_services.service_name ?? 'Sin nombre'} · ${formatDay(cert.period_from)} — ${formatDay(cert.period_to)}`
                : 'Detalle de la certificación'}
            </SheetDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cerrar detalle"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        {detail.isPending ? (
          <DetailSkeleton />
        ) : detail.isError ? (
          <StateBlock
            variant="error"
            title="No se pudo cargar la certificación"
            description={detail.error instanceof Error ? detail.error.message : 'Probá de nuevo en unos segundos.'}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => detail.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : !cert ? (
          <StateBlock
            variant="empty"
            title="La certificación ya no existe"
            description="Pudo eliminarse mientras la mirabas. Cerrá el panel y actualizá la lista."
          />
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {cert.status === 'anulada' && cert.voided_reason && (
                <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm break-words">
                  Anulada{cert.voided_at ? ` el ${formatArgentinaDay(cert.voided_at)}` : ''}: {cert.voided_reason}
                </p>
              )}

              <CertificationInvoicesNote status={cert.status} invoices={cert.invoices} />

              {cert.notes ? (
                <div className="space-y-1">
                  <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Observaciones</h3>
                  <p className="text-sm break-words whitespace-pre-line">{cert.notes}</p>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ítem</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      {canViewPrices && <TableHead className="text-right">Unitario</TableHead>}
                      {canViewPrices && <TableHead className="text-right">Importe</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cert.lines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canViewPrices ? 5 : 3} className="text-muted-foreground py-6 text-center">
                          Sin líneas. Recalculá para traer lo trabajado en el período.
                        </TableCell>
                      </TableRow>
                    )}
                    {cert.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-sm">{line.service_items.item_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{line.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                        {canViewPrices && (
                          <TableCell className="text-right">
                            <CertificationAmount value={line.unit_price} currency={cert.currency} />
                          </TableCell>
                        )}
                        {canViewPrices && (
                          <TableCell className="text-right">
                            <CertificationAmount value={line.amount} currency={cert.currency} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {canViewPrices && (
                <div className="flex justify-end gap-3 border-t pt-3 text-lg font-semibold">
                  <span>Total</span>
                  <CertificationAmount value={cert.total} currency={cert.currency} />
                </div>
              )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t p-4">
              {/* Imprimir no cambia nada: va separado de las acciones que mueven el estado. */}
              <div className="sm:mr-auto">
                <DownloadPdfButton load={() => getCertificationPdf(cert.id)} size="default" />
              </div>
              {isEditable(cert.status) && canUpdate && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    transition.mutate({ run: () => refreshCertificationLines(cert.id), success: 'Líneas recalculadas' })
                  }
                >
                  Recalcular líneas
                </Button>
              )}
              {isDeletable(cert.status) && canDelete && (
                <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmingDelete(true)}>
                  Eliminar borrador
                </Button>
              )}
              {cert.status === 'borrador' && canUpdate && (
                <Button
                  type="button"
                  disabled={pending || cert.lines.length === 0}
                  onClick={() =>
                    transition.mutate({ run: () => issueCertification(cert.id), success: 'Certificación emitida' })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Emitir
                </Button>
              )}
              {cert.status === 'emitida' && canApprove && (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    transition.mutate({ run: () => confirmCertification(cert.id), success: 'Certificación confirmada' })
                  }
                >
                  Confirmar
                </Button>
              )}
              {(cert.status === 'emitida' || cert.status === 'confirmada') && canDelete && (
                <Button type="button" variant="destructive" disabled={pending} onClick={() => setVoiding(true)}>
                  Anular
                </Button>
              )}
            </footer>

            <VoidCertificationDialog
              open={voiding}
              onOpenChange={setVoiding}
              number={cert.number}
              pending={pending}
              onConfirm={(reason) =>
                transition.mutate(
                  { run: () => voidCertification(cert.id, reason), success: 'Certificación anulada' },
                  { onSuccess: () => setVoiding(false) }
                )
              }
            />

            {/* ── Eliminar borrador: confirmación ── */}
            <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar el borrador?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se elimina la certificación {cert.number}. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={pending}
                    onClick={(event) => {
                      event.preventDefault();
                      transition.mutate(
                        { run: () => deleteCertification(cert.id), success: 'Borrador eliminado', afterClose: true },
                        { onSuccess: () => setConfirmingDelete(false) }
                      );
                    }}
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
