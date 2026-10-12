'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { DownloadPdfButton } from '@/shared/components/common/DownloadPdfButton';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { invalidatePurchases } from '../lib/invalidate';
import type { SendDocumentValues } from '../schemas/send';

const logger = new Logger('Purchases/SendToSupplierDialog');

const EMAIL = z.string().email();

/** Los contactos tildados + otros mails escritos a mano (separados por coma o espacio). */
const dialogSchema = z
  .object({
    selected: z.array(z.string()),
    extra: z.string().trim(),
    message: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
  })
  .superRefine((v, ctx) => {
    const extras = splitEmails(v.extra);
    const invalid = extras.find((email) => !EMAIL.safeParse(email).success);
    if (invalid) ctx.addIssue({ code: 'custom', path: ['extra'], message: `Mail inválido: ${invalid}` });
    if (v.selected.length === 0 && extras.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['extra'], message: 'Elegí al menos un destinatario' });
    }
  });

type DialogValues = z.infer<typeof dialogSchema>;

function splitEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

interface SendToSupplierDialogProps {
  /** Con su articulo: "el pedido de cotización PC-000003" / "la orden de compra OC-000007". */
  documentLabel: string;
  recipients: readonly { name: string; email: string; isPrimary: boolean }[];
  send: (values: SendDocumentValues) => Promise<ActionResult>;
  loadPdf: () => Promise<ActionResult<{ filename: string; base64: string }>>;
  /** Avisos que no bloquean (documentos vencidos del proveedor). */
  warning?: ReactNode;
}

/**
 * Envio al proveedor por mail con el PDF adjunto. Por defecto va al contacto principal; se pueden
 * sumar otros contactos o mails. Si el mail no sale, el documento queda como estaba y el dialogo
 * sigue abierto con el error.
 */
export function SendToSupplierDialog({ documentLabel, recipients, send, loadPdf, warning }: SendToSupplierDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const primary = recipients.filter((recipient) => recipient.isPrimary).map((recipient) => recipient.email);

  const form = useForm<DialogValues>({
    resolver: zodResolver(dialogSchema),
    defaultValues: { selected: primary, extra: '', message: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: DialogValues) => {
      const to = [...new Set([...values.selected, ...splitEmails(values.extra)])];
      unwrapAction(await send({ to, message: values.message }));
      return to;
    },
    onSuccess: (to) => {
      toast.success(`Se envió ${documentLabel} a ${to.join(', ')}`);
      setOpen(false);
      invalidatePurchases(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al enviar al proveedor', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el mail');
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset({ selected: primary, extra: '', message: '' });
      }}
    >
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Mail className="mr-1 h-4 w-4" />
        Enviar al proveedor
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar al proveedor</DialogTitle>
          <DialogDescription>
            Se manda por mail {documentLabel} con el PDF adjunto. Recién cuando el mail sale queda como enviado.
          </DialogDescription>
        </DialogHeader>
        {warning}
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            {recipients.length > 0 ? (
              <FormField
                control={form.control}
                name="selected"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contactos del proveedor</FormLabel>
                    <div className="space-y-2">
                      {recipients.map((recipient) => (
                        <label key={recipient.email} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(recipient.email)}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, recipient.email]
                                  : field.value.filter((email) => email !== recipient.email)
                              )
                            }
                          />
                          <span>
                            {recipient.name} <span className="text-muted-foreground">({recipient.email})</span>
                            {recipient.isPrimary && (
                              <span className="ml-1 text-xs text-muted-foreground">· principal</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                El proveedor no tiene contactos con mail: escribí a quién enviarlo.
              </p>
            )}
            <FormField
              control={form.control}
              name="extra"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Otros destinatarios</FormLabel>
                  <FormControl>
                    <Input placeholder="compras@proveedor.com, ventas@proveedor.com" {...field} />
                  </FormControl>
                  <FormDescription>Separados por coma.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensaje (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Va en el cuerpo del mail" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:justify-between">
              <DownloadPdfButton load={loadPdf} label="Ver PDF" />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Enviando…' : 'Enviar'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
