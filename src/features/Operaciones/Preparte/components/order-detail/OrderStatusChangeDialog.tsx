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
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { argentinaDate } from '@/features/Jobs/lib/dates';
import { zodResolver } from '@hookform/resolvers/zod';
import moment from 'moment';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { PreparteItem } from '../PreparteManager';

export type OrderStatusChangeMode = 'reject' | 'cancel' | 'reprogram';

export interface OrderStatusChangeValues {
  reason: string;
  /** `YYYY-MM-DD`; solo se completa al reprogramar. */
  date: string;
}

interface ModeCopy {
  title: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  help: string;
  submitLabel: string;
  submittingLabel: string;
  destructive: boolean;
}

const MODE_COPY: Record<OrderStatusChangeMode, ModeCopy> = {
  reject: {
    title: 'Rechazar pedido',
    reasonLabel: 'Motivo del rechazo',
    reasonPlaceholder: 'Contá por qué se rechaza el pedido',
    help: 'Queda registrado en el historial del pedido. No se puede deshacer.',
    submitLabel: 'Rechazar pedido',
    submittingLabel: 'Rechazando...',
    destructive: true,
  },
  cancel: {
    title: 'Cancelar pedido',
    reasonLabel: 'Motivo de la cancelación',
    reasonPlaceholder: 'Contá por qué se cancela el pedido',
    help: 'Queda registrado en el historial del pedido. No se puede deshacer.',
    submitLabel: 'Cancelar pedido',
    submittingLabel: 'Cancelando...',
    destructive: true,
  },
  reprogram: {
    title: 'Reprogramar pedido',
    reasonLabel: 'Motivo de la reprogramación',
    reasonPlaceholder: 'Contá por qué se reprograma el pedido',
    help: 'Se crea un pedido nuevo para la fecha elegida y este queda como reprogramado.',
    submitLabel: 'Reprogramar pedido',
    submittingLabel: 'Reprogramando...',
    destructive: false,
  },
};

function buildSchema(mode: OrderStatusChangeMode): z.ZodType<OrderStatusChangeValues> {
  return z
    .object({
      reason: z.string().trim().min(1, 'Ingresá el motivo'),
      date: z.string(),
    })
    .superRefine((values, ctx) => {
      if (mode !== 'reprogram') return;
      if (!values.date) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'Elegí la nueva fecha' });
      } else if (values.date < argentinaDate()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'La fecha no puede ser anterior a hoy' });
      }
    });
}

interface OrderStatusChangeDialogProps {
  mode: OrderStatusChangeMode;
  item: PreparteItem;
  /** Ejecuta el cambio. Devuelve `true` si se aplicó (el padre cierra el panel). */
  onSubmit: (values: OrderStatusChangeValues) => Promise<boolean>;
  /** Vuelve al detalle del pedido. */
  onBack: () => void;
  /** Cierra todo (Escape o clic fuera). */
  onClose: () => void;
  /** Al cerrarse el diálogo: el padre decide a dónde vuelve el foco (ver `PreparteManager`). */
  onCloseAutoFocus?: (event: Event) => void;
}

/** Diálogo para rechazar, cancelar o reprogramar un pedido pidiendo el motivo (y la fecha nueva al reprogramar). */
export function OrderStatusChangeDialog({
  mode,
  item,
  onSubmit,
  onBack,
  onClose,
  onCloseAutoFocus,
}: OrderStatusChangeDialogProps) {
  const copy = MODE_COPY[mode];
  const isReprogram = mode === 'reprogram';
  const schema = useMemo(() => buildSchema(mode), [mode]);
  const minDate = useMemo(() => moment(argentinaDate(), 'YYYY-MM-DD').toDate(), []);

  const form = useForm<OrderStatusChangeValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '', date: '' },
  });
  const isSubmitting = form.formState.isSubmitting;

  const handleSubmit = async (values: OrderStatusChangeValues) => {
    await onSubmit({ reason: values.reason.trim(), date: values.date });
  };

  const orderLabel = [item.numero_pedido, item.customers?.name].filter(Boolean).join(' · ');

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription className="break-words [overflow-wrap:anywhere]">
            {orderLabel || 'Pedido seleccionado'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
            {isReprogram && (
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nueva fecha de ejecución</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        date={field.value || undefined}
                        setDate={(next) => field.onChange(next ? moment(next).format('YYYY-MM-DD') : '')}
                        minDate={minDate}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.reasonLabel}</FormLabel>
                  <FormControl>
                    <Textarea rows={4} placeholder={copy.reasonPlaceholder} {...field} />
                  </FormControl>
                  <FormDescription>{copy.help}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
                Volver
              </Button>
              <Button type="submit" variant={copy.destructive ? 'destructive' : 'default'} disabled={isSubmitting}>
                {isSubmitting ? copy.submittingLabel : copy.submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
