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
import { Form } from '@/components/ui/form';
import { Logger } from '@/lib/logger';
import { InputFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { sendReceipt } from '../../actions/receipts.server';
import { invalidateTreasury } from '../../lib/invalidate';
import { sendReceiptFormSchema, splitEmails, type SendReceiptFormValues } from '../../schemas/send-receipt';

const logger = new Logger('Treasury/SendReceiptDialog');

/**
 * Envía el recibo al cliente por mail con el PDF adjunto. Propone el mail del cliente; se pueden
 * cargar varios separados por coma. Si el mail no sale, el recibo no queda como enviado.
 */
export function SendReceiptDialog({
  receiptId,
  number,
  defaultEmail,
}: {
  receiptId: string;
  number: string;
  defaultEmail: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const defaults = { to: defaultEmail ?? '', message: '' };
  const form = useForm<SendReceiptFormValues>({
    resolver: zodResolver(sendReceiptFormSchema),
    defaultValues: defaults,
  });

  const send = useMutation({
    mutationFn: async (values: SendReceiptFormValues) => {
      const to = splitEmails(values.to);
      unwrapAction(await sendReceipt(receiptId, { to, message: values.message }));
      return to;
    },
    onSuccess: (to) => {
      toast.success(`Se envió ${number} a ${to.join(', ')}`);
      setOpen(false);
      invalidateTreasury(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al enviar el recibo', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el recibo');
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Mail className="mr-1 h-4 w-4" />
        Enviar al cliente
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar {number} al cliente</DialogTitle>
          <DialogDescription>
            Se manda por mail con el PDF adjunto. Recién cuando el mail sale queda como enviado.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => send.mutate(values))} className="space-y-4">
            <InputFormField
              control={form.control}
              name="to"
              label="Para"
              placeholder="pagos@cliente.com, tesoreria@cliente.com"
            />
            <TextareaFormField control={form.control} name="message" label="Mensaje (opcional)" rows={3} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={send.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={send.isPending}>
                {send.isPending ? 'Enviando…' : 'Enviar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
