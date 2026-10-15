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
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Textarea } from '@/components/ui/textarea';
import { CertificationAmount } from '@/features/Comercial/Certificaciones/components/CertificationAmount';
import { Logger } from '@/lib/logger';
import { CBTE_TYPES, cbteTypeFor } from '@/shared/lib/arca/catalogs';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { formatAmountText } from '@/shared/utils/amount-text';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Info } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  deleteInvoiceDraft,
  removeCertificationFromDraft,
  saveInvoiceDraft,
} from '../../actions/invoice-drafts-edit.server';
import { validateInvoiceForIssueAction } from '../../actions/invoice-emission.server';
import type { InvoiceEditorData } from '../../actions/invoices.server';
import type { IssueProblem } from '../../lib/invoice-validation';
import { INVOICING_TAB_HREF, countLabel, invoiceHref } from '../../utils/invoice-links';
import { InvoiceEnvironmentNotice } from '../InvoiceEnvironmentNotice';
import { InvoiceLetterBox } from '../InvoiceLetterBox';
import { InvoiceStatusBadge } from '../InvoiceStatusBadge';
import { IncludedCertifications } from './IncludedCertifications';
import { InvoiceHeaderFields } from './InvoiceHeaderFields';
import { InvoiceLinesEditor } from './InvoiceLinesEditor';
import { InvoiceReceiver } from './InvoiceReceiver';
import { InvoiceTotals } from './InvoiceTotals';
import { MobileIssueBar } from './MobileIssueBar';
import { buildEditorSchema, toDraftInput, toEditorValues, type EditorValues } from './editor-form';

const logger = new Logger('features/Comercial/Facturacion/InvoiceDraftForm');

export type InvoicePermissions = {
  canCreate: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canViewPrices: boolean;
};

type Props = {
  data: InvoiceEditorData;
  permissions: InvoicePermissions;
  /** Motivo por el que no se puede emitir (permisos); `null` si se puede. */
  issueBlockedReason: string | null;
  /** Paneles del contenedor (rechazo de ARCA, checklist, fallo de emisión), debajo del encabezado. */
  banner: ReactNode;
  onProblems: (problems: IssueProblem[]) => void;
  onReadyToIssue: () => void;
};

const ISSUE_REASON_ID = 'invoice-issue-blocked-reason';

/**
 * Formulario del borrador. El contenedor lo monta con `key` = última modificación: después de
 * guardar (el servidor rehace las líneas con ids nuevos) se vuelve a montar con los datos frescos.
 */
export function InvoiceDraftForm({ data, permissions, issueBlockedReason, banner, onProblems, onReadyToIssue }: Props) {
  const router = useRouter();
  const { invoice, fiscal } = data;
  const [busy, startBusy] = useTransition();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const canEdit = permissions.canCreate;
  // Una factura deriva la letra de las condiciones ACTUALES; si no se puede derivar, se conserva la guardada.
  const letter = data.letter.ok ? data.letter.letter : invoice.letter;
  const derivedCbteType = cbteTypeFor(letter, invoice.kind);
  const letterChanged = data.letter.ok && letter !== invoice.letter;

  const schema = useMemo(() => buildEditorSchema(letter), [letter]);
  const form = useForm<EditorValues>({
    resolver: zodResolver(schema),
    defaultValues: toEditorValues(invoice),
  });
  const { isDirty } = form.formState;

  // Guard de salida del navegador (recargar, cerrar la pestaña) con cambios sin guardar.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const linesByCertification = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const line of invoice.lines) {
      if (line.certificationId) counts[line.certificationId] = (counts[line.certificationId] ?? 0) + 1;
    }
    return counts;
  }, [invoice.lines]);

  /** Guarda y devuelve el total guardado, o `null` si falló (el error ya se mostró). */
  const persist = async (values: EditorValues): Promise<{ total: string | null } | null> => {
    const result = await saveInvoiceDraft(invoice.id, toDraftInput(values));
    if (!result.ok) {
      logger.warn('No se guardó el borrador', { data: { id: invoice.id, error: result.error } });
      toast.error(`No se guardó el borrador: ${result.error}`);
      return null;
    }
    return { total: result.data.total };
  };

  const onSave = (values: EditorValues) => {
    startBusy(async () => {
      const saved = await persist(values);
      if (saved === null) return;
      toast.success(
        saved.total === null
          ? 'Borrador guardado.'
          : `Borrador guardado. Total ${invoice.currency} ${formatAmountText(saved.total)}.`
      );
      router.refresh();
    });
  };

  const onIssueClick = () => {
    if (issueBlockedReason || busy) return;
    void form.handleSubmit(
      (values) =>
        startBusy(async () => {
          // Lo que se emite es lo guardado: primero se guardan los cambios pendientes.
          if (form.formState.isDirty) {
            const saved = await persist(values);
            if (saved === null) return;
            router.refresh();
          }
          const check = await validateInvoiceForIssueAction(invoice.id);
          if (!check.ok) {
            toast.error(check.error);
            return;
          }
          if (check.data.problems.length > 0) {
            onProblems(check.data.problems);
            return;
          }
          onProblems([]);
          onReadyToIssue();
        }),
      () => toast.error('Corregí los campos marcados antes de emitir.')
    )();
  };

  const onRemoveCertification = async (certificationId: string): Promise<boolean> => {
    const number = invoice.certifications.find((c) => c.id === certificationId)?.number ?? 'La certificación';
    if (form.formState.isDirty) {
      const valid = await form.trigger();
      if (!valid) {
        toast.error('Corregí los campos marcados: hay que guardar los cambios antes de quitar la certificación.');
        return false;
      }
      const saved = await persist(form.getValues());
      if (saved === null) return false;
    }
    const result = await removeCertificationFromDraft(invoice.id, certificationId);
    if (!result.ok) {
      toast.error(`No se quitó la certificación: ${result.error}`);
      return false;
    }
    toast.success(
      result.data.total === null
        ? `${number} quitada y disponible para facturar.`
        : `${number} quitada y disponible para facturar. Nuevo total ${invoice.currency} ${formatAmountText(result.data.total)}.`
    );
    router.refresh();
    return true;
  };

  const onDiscard = () => {
    startBusy(async () => {
      const result = await deleteInvoiceDraft(invoice.id);
      if (!result.ok) {
        toast.error(`No se descartó el borrador: ${result.error}`);
        return;
      }
      const released = result.data.releasedCertifications;
      toast.success(
        released > 0
          ? `Borrador descartado. ${countLabel(released, 'certificación liberada', 'certificaciones liberadas')}.`
          : 'Borrador descartado.'
      );
      setDiscardOpen(false);
      router.push(INVOICING_TAB_HREF);
    });
  };

  const statusWord = invoice.status === 'rechazada' ? 'Rechazada' : 'Borrador';
  const environmentForNotice = invoice.kind === 'invoice' ? fiscal.environment : invoice.environment;

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* ── Encabezado ── */}
      <div className="flex flex-col gap-3">
        <Link
          href={INVOICING_TAB_HREF}
          onClick={(event) => {
            if (!isDirty) return;
            event.preventDefault();
            setLeaveOpen(true);
          }}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex w-fit items-center gap-1 text-sm outline-none focus-visible:ring-[3px]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Facturación
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <InvoiceLetterBox letter={invoice.letter} />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-balance">
                {invoice.cbteLabel} · {statusWord}
              </h1>
              <p className="text-muted-foreground text-sm">
                <span className="break-words">{invoice.customer.name}</span> · {invoice.currency}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <InvoiceStatusBadge
              status={invoice.status}
              simulated={invoice.simulated}
              environment={invoice.environment}
            />
            <p className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
              {isDirty ? 'Cambios sin guardar' : `Guardado ${formatArgentinaDateTime(invoice.updatedAt)}`}
            </p>
          </div>
        </div>
      </div>

      <InvoiceEnvironmentNotice environment={environmentForNotice} simulated={fiscal.simulated} scope="draft" />

      {banner}

      {!canEdit && (
        <p role="note" className="text-muted-foreground flex items-center gap-2 text-sm">
          <Info className="size-4 shrink-0" aria-hidden />
          Podés ver este borrador pero no modificarlo: necesitás el permiso Crear en Facturación.
        </p>
      )}

      {invoice.kind !== 'invoice' && invoice.associatedInvoice && (
        <div className="bg-muted/40 flex flex-col gap-1 border px-4 py-3 text-sm">
          <p>
            {invoice.cbteLabel} asociada a{' '}
            <Link
              href={invoiceHref(invoice.associatedInvoice.id)}
              className="font-medium tabular-nums underline underline-offset-4"
            >
              {invoice.associatedInvoice.label}
            </Link>
            {permissions.canViewPrices && (
              <>
                {' '}
                por <CertificationAmount value={invoice.associatedInvoice.total} currency={invoice.currency} />
              </>
            )}
            .
          </p>
          {data.creditable && permissions.canViewPrices && (
            <p className="text-muted-foreground">
              Saldo disponible para acreditar:{' '}
              <span className="text-foreground font-medium">
                <CertificationAmount value={data.creditable.remaining} currency={invoice.currency} />
              </span>{' '}
              de <CertificationAmount value={data.creditable.total} currency={invoice.currency} />.
            </p>
          )}
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSave)}
          className="grid grid-cols-1 gap-6 [scroll-padding-bottom:6rem] lg:grid-cols-[minmax(0,1fr)_20rem]"
        >
          {/* ── Columna principal ── */}
          <div className="flex min-w-0 flex-col gap-8">
            <fieldset disabled={!canEdit || busy} className="min-w-0">
              <InvoiceHeaderFields
                salesPoints={data.salesPoints}
                canEdit={canEdit}
                conceptFixed={invoice.certifications.length > 0}
              />
            </fieldset>

            <InvoiceReceiver customer={invoice.customer} />

            {invoice.currency !== 'ARS' && (
              <p role="note" className="text-muted-foreground text-sm text-pretty">
                Moneda: {invoice.currency}. La cotización la informa ARCA al emitir y queda fija en el comprobante.
              </p>
            )}

            <InvoiceLinesEditor
              letter={letter}
              currency={invoice.currency}
              canEdit={canEdit}
              canViewPrices={permissions.canViewPrices}
            />

            <IncludedCertifications
              certifications={invoice.certifications}
              currency={invoice.currency}
              canEdit={canEdit}
              canViewPrices={permissions.canViewPrices}
              linesByCertification={linesByCertification}
              isDirty={isDirty}
              onRemove={onRemoveCertification}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem data-field="notes">
                  <FormLabel className="text-lg font-semibold">Observaciones</FormLabel>
                  <FormControl>
                    <Textarea
                      name={field.name}
                      ref={field.ref}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      readOnly={!canEdit}
                      maxLength={1000}
                      className="min-h-20"
                    />
                  </FormControl>
                  <FormDescription>Se imprimen en la factura.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* ── Columna lateral (después de las líneas en el DOM; sticky en desktop, debajo del header h-16) ── */}
          <aside
            aria-label="Tipo de comprobante, totales y acciones"
            className="flex flex-col gap-6 self-start border p-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <InvoiceLetterBox letter={letter} />
                <div>
                  <p className="font-semibold">{CBTE_TYPES[derivedCbteType].label}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    Código {String(derivedCbteType).padStart(2, '0')}
                  </p>
                </div>
              </div>
              <p
                className={
                  data.letter.ok ? 'text-muted-foreground text-sm text-pretty' : 'text-destructive text-sm text-pretty'
                }
              >
                {data.letter.ok ? data.letter.reason : data.letter.error}
              </p>
              {letterChanged && (
                <p role="note" className="text-sm text-warn-subtle-foreground text-pretty">
                  Al guardar pasa de {invoice.cbteLabel} a {CBTE_TYPES[derivedCbteType].label}: cambiaron las
                  condiciones frente al IVA.
                </p>
              )}
            </div>

            {permissions.canViewPrices && <InvoiceTotals letter={letter} currency={invoice.currency} />}

            {data.issueProblems.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                <p className="font-medium">Para emitir falta ({data.issueProblems.length}), según lo guardado:</p>
                <ul className="text-muted-foreground flex list-disc flex-col gap-0.5 ps-5">
                  {data.issueProblems.slice(0, 5).map((problem, index) => (
                    <li key={`${problem.field}-${index}`} className="text-pretty">
                      {problem.message}
                    </li>
                  ))}
                  {data.issueProblems.length > 5 && <li>y {data.issueProblems.length - 5} más.</li>}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="brand"
                aria-disabled={issueBlockedReason !== null || busy}
                aria-describedby={issueBlockedReason ? ISSUE_REASON_ID : undefined}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                onClick={onIssueClick}
              >
                <LoadingSwap isLoading={busy}>Emitir {CBTE_TYPES[derivedCbteType].label}</LoadingSwap>
              </Button>
              {issueBlockedReason && (
                <p id={ISSUE_REASON_ID} className="text-muted-foreground text-xs text-pretty">
                  {issueBlockedReason}
                </p>
              )}
              {canEdit && (
                <Button type="submit" variant="outline" disabled={busy}>
                  Guardar borrador
                </Button>
              )}
              {permissions.canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => setDiscardOpen(true)}
                >
                  Descartar borrador
                </Button>
              )}
            </div>
          </aside>
        </form>
      </Form>

      {permissions.canViewPrices && (
        <MobileIssueBar
          control={form.control}
          letter={letter}
          currency={invoice.currency}
          blocked={issueBlockedReason !== null || busy}
          onIssue={onIssueClick}
        />
      )}

      {/* ── Descartar ── */}
      <AlertDialog open={discardOpen} onOpenChange={(open) => !busy && setDiscardOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar el borrador?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              Se elimina el borrador
              {invoice.lines.length === 0
                ? ''
                : invoice.lines.length === 1
                  ? ' con su línea'
                  : ` con sus ${countLabel(invoice.lines.length, 'línea', 'líneas')}`}
              {invoice.certifications.length === 0
                ? '.'
                : invoice.certifications.length === 1
                  ? ' y la certificación queda disponible para facturar.'
                  : ` y las ${invoice.certifications.length} certificaciones quedan disponibles para facturar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Seguir editando</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy} onClick={onDiscard}>
              <LoadingSwap isLoading={busy}>Descartar borrador</LoadingSwap>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Salir con cambios sin guardar ── */}
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>
              Tenés cambios sin guardar en el borrador. Si salís, se pierden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => router.push(INVOICING_TAB_HREF)}>
              Salir sin guardar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
