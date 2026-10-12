'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { INVOICE_STATUS_LABELS } from '@/features/Comercial/Facturacion/lib/invoice-state-machine';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { DownloadPdfButton } from '@/shared/components/common/DownloadPdfButton';
import { zodResolver } from '@hookform/resolvers/zod';
import { Receipt } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  confirmCertification,
  createCertification,
  deleteCertification,
  getCertificationPdf,
  issueCertification,
  refreshCertificationLines,
  voidCertification,
  type CertificationDetail,
  type CertificationRow,
} from '../actions/certifications.server';
import { isDeletable, isEditable } from '../lib/state-machine';
import { certificationFormSchema, type CertificationFormValues } from '../schemas/certification';
import { CertificationAmount } from './CertificationAmount';
import { CertificationStatusBadge } from './CertificationStatusBadge';

const INVOICE_LINK_CLASS =
  'font-medium whitespace-nowrap tabular-nums underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Comprobantes que facturan (o facturaron) la certificación. Los vigentes van primero: autorizado
 * = "Facturada en…"; en curso (borrador, pendiente…) = "Incluida en…", porque la certificación ya
 * quedó reservada. Los liberados por una nota de crédito total quedan como línea histórica.
 */
function CertificationInvoicesNote({
  status,
  invoices,
}: {
  status: CertificationDetail['status'];
  invoices: CertificationDetail['invoices'];
}) {
  if (invoices.length === 0) return null;
  const current = invoices.filter((invoice) => !invoice.released);
  const released = invoices.filter((invoice) => invoice.released);

  return (
    <div role="note" className="flex items-start gap-3 border px-4 py-3 text-sm">
      <Receipt className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1 text-pretty">
        {current.map((invoice) =>
          invoice.status === 'autorizada' ? (
            <p key={invoice.id}>
              Facturada en{' '}
              <Link href={`/dashboard/comercial/facturacion/${invoice.id}`} className={INVOICE_LINK_CLASS}>
                {invoice.label}
              </Link>
              .
            </p>
          ) : (
            <p key={invoice.id}>
              Incluida en{' '}
              <Link href={`/dashboard/comercial/facturacion/${invoice.id}`} className={INVOICE_LINK_CLASS}>
                {invoice.label}
              </Link>{' '}
              ({INVOICE_STATUS_LABELS[invoice.status].toLowerCase()}): no se puede incluir en otra factura.
            </p>
          )
        )}
        {status === 'facturada' && (
          <p className="text-muted-foreground">
            Para anularla, primero emití una nota de crédito total sobre la factura.
          </p>
        )}
        {released.map((invoice) => (
          <p key={invoice.id} className="text-muted-foreground">
            Estuvo facturada en{' '}
            <Link href={`/dashboard/comercial/facturacion/${invoice.id}`} className={INVOICE_LINK_CLASS}>
              {invoice.label}
            </Link>{' '}
            (anulada con nota de crédito).
          </p>
        ))}
      </div>
    </div>
  );
}

interface CustomerOption {
  id: string;
  name: string;
  services: { id: string; service_name: string | null }[];
}

interface CertificacionesPanelProps {
  certifications: CertificationRow[];
  customers: CustomerOption[];
  onOpenDetail: (id: string) => Promise<CertificationDetail | null>;
}

/**
 * Certificaciones: listado, alta y el circuito de estados.
 *
 * El botón que se muestra depende del estado, no al revés: la máquina de estados
 * (`lib/state-machine`) decide qué transiciones existen y acá sólo se dibujan.
 */
export function CertificacionesPanel({ certifications, customers, onOpenDetail }: CertificacionesPanelProps) {
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<CertificationDetail | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [pending, startTransition] = useTransition();
  const { hasPermission } = usePermissions();

  const canCreate = hasPermission('comercial', 'certificaciones', 'create');
  const canUpdate = hasPermission('comercial', 'certificaciones', 'update');
  const canApprove = hasPermission('comercial', 'certificaciones', 'approve');
  const canDelete = hasPermission('comercial', 'certificaciones', 'delete');
  // Ver una certificación y ver lo que vale son permisos distintos.
  const canViewPrices = hasPermission('comercial', 'certificaciones', 'view_prices');

  const form = useForm<CertificationFormValues>({
    resolver: zodResolver(certificationFormSchema),
    defaultValues: { customerId: '', customerServiceId: '', periodFrom: '', periodTo: '', notes: '' },
  });

  const selectedCustomer = form.watch('customerId');
  const servicesOfCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomer)?.services ?? [],
    [customers, selectedCustomer]
  );

  const run = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
    startTransition(async () => {
      const result = await accion();
      if (!result.ok) {
        toast.error(result.error ?? 'No se pudo completar la acción');
        return;
      }
      toast.success(exito);
      if (detail) setDetail(await onOpenDetail(detail.id));
    });
  };

  const onSubmit = (values: CertificationFormValues) => {
    startTransition(async () => {
      const result = await createCertification(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Certificación creada en borrador');
      setCreating(false);
      form.reset();
      setDetail(await onOpenDetail(result.data.id));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Certificaciones</h3>
          <p className="text-muted-foreground text-sm">
            Lo trabajado para un cliente, bajo un contrato, en un período.
          </p>
        </div>
        {canCreate && (
          <Button type="button" onClick={() => setCreating(true)}>
            Nueva certificación
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>Período</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Líneas</TableHead>
            {canViewPrices && <TableHead className="text-right">Total</TableHead>}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {certifications.length === 0 && (
            <TableRow>
              <TableCell colSpan={canViewPrices ? 8 : 7} className="text-muted-foreground py-8 text-center">
                Todavía no hay certificaciones. Se arma una eligiendo cliente, contrato y período.
              </TableCell>
            </TableRow>
          )}
          {certifications.map((cert) => (
            <TableRow key={cert.id}>
              <TableCell className="font-mono text-sm">{cert.number}</TableCell>
              <TableCell>{cert.customers.name}</TableCell>
              <TableCell>{cert.customer_services.service_name ?? '—'}</TableCell>
              <TableCell className="text-sm">
                {moment(cert.period_from).format('DD/MM/YYYY')} — {moment(cert.period_to).format('DD/MM/YYYY')}
              </TableCell>
              <TableCell>
                <CertificationStatusBadge status={cert.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{cert._count.lines}</TableCell>
              {canViewPrices && (
                <TableCell className="text-right">
                  <CertificationAmount value={cert.total} currency={cert.currency} />
                </TableCell>
              )}
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => startTransition(async () => setDetail(await onOpenDetail(cert.id)))}
                >
                  Ver
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ── Alta ── */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Nueva certificación</DialogTitle>
            <DialogDescription>
              Se crea en borrador. Las líneas se arman con lo trabajado en el período y los precios se congelan recién
              al emitirla.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue('customerServiceId', '');
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegí un cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerServiceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contrato</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={!selectedCustomer}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={selectedCustomer ? 'Elegí un contrato' : 'Primero elegí el cliente'}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {servicesOfCustomer.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.service_name ?? 'Sin nombre'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="periodFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desde</FormLabel>
                      <FormControl>
                        {/* `type="date"` permite escribir la fecha además de elegirla. */}
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="periodTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hasta</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observaciones</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting || pending}>
                  Crear borrador
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Detalle ── */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-[820px]">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span className="font-mono">{detail.number}</span>
                  <CertificationStatusBadge status={detail.status} />
                </DialogTitle>
                <DialogDescription>
                  {detail.customers.name} · {detail.customer_services.service_name ?? 'Sin nombre'} ·{' '}
                  {moment(detail.period_from).format('DD/MM/YYYY')} — {moment(detail.period_to).format('DD/MM/YYYY')}
                </DialogDescription>
              </DialogHeader>

              {detail.status === 'anulada' && detail.voided_reason && (
                <p className="border-destructive/30 bg-destructive/10 text-destructive border p-3 text-sm">
                  Anulada el {moment(detail.voided_at).format('DD/MM/YYYY')}: {detail.voided_reason}
                </p>
              )}

              <CertificationInvoicesNote status={detail.status} invoices={detail.invoices} />

              <div className="max-h-[320px] overflow-y-auto">
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
                    {detail.lines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canViewPrices ? 5 : 3} className="text-muted-foreground py-6 text-center">
                          Sin líneas. Recalculá para traer lo trabajado en el período.
                        </TableCell>
                      </TableRow>
                    )}
                    {detail.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-sm">{line.service_items.item_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{line.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                        {canViewPrices && (
                          <TableCell className="text-right">
                            <CertificationAmount value={line.unit_price} currency={detail.currency} />
                          </TableCell>
                        )}
                        {canViewPrices && (
                          <TableCell className="text-right">
                            <CertificationAmount value={line.amount} currency={detail.currency} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {canViewPrices && (
                <>
                  <Separator />
                  <div className="flex justify-end gap-3 text-lg font-semibold">
                    <span>Total</span>
                    <CertificationAmount value={detail.total} currency={detail.currency} />
                  </div>
                </>
              )}

              <DialogFooter className="gap-2">
                {/* Imprimir no cambia nada: va separado de las acciones que mueven el estado. */}
                <div className="sm:mr-auto">
                  <DownloadPdfButton load={() => getCertificationPdf(detail.id)} size="default" />
                </div>
                {isEditable(detail.status) && canUpdate && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => refreshCertificationLines(detail.id), 'Líneas recalculadas')}
                  >
                    Recalcular líneas
                  </Button>
                )}
                {isDeletable(detail.status) && canDelete && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteCertification(detail.id);
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success('Borrador eliminado');
                        setDetail(null);
                      })
                    }
                  >
                    Eliminar borrador
                  </Button>
                )}
                {detail.status === 'borrador' && canUpdate && (
                  <Button
                    type="button"
                    disabled={pending || detail.lines.length === 0}
                    onClick={() => run(() => issueCertification(detail.id), 'Certificación emitida')}
                  >
                    Emitir
                  </Button>
                )}
                {detail.status === 'emitida' && canApprove && (
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => confirmCertification(detail.id), 'Certificación confirmada')}
                  >
                    Confirmar
                  </Button>
                )}
                {(detail.status === 'emitida' || detail.status === 'confirmada') && canDelete && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => setVoidingId(detail.id)}
                  >
                    Anular
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Anulación: el motivo es obligatorio ── */}
      <Dialog open={!!voidingId} onOpenChange={(open) => !open && setVoidingId(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Anular certificación</DialogTitle>
            <DialogDescription>
              Una certificación emitida no se modifica: se anula y se emite otra. El motivo queda guardado.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Por qué se anula"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVoidingId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !voidReason.trim()}
              onClick={() =>
                startTransition(async () => {
                  const result = await voidCertification(voidingId!, voidReason);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success('Certificación anulada');
                  setVoidingId(null);
                  setVoidReason('');
                  if (detail) setDetail(await onOpenDetail(detail.id));
                })
              }
            >
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
