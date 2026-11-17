'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { saveMonthlyCycle, type MonthlyCyclesData } from '../../actions/monthly-cycles';
import { CYCLE_KINDS, CYCLE_KIND_UI } from '../../lib/monthly-cycle-check';

type Cycle = MonthlyCyclesData['cycles'][number];

const amount = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+([.,]\d{1,2})?$/.test(v), 'Monto inválido (ej.: 1250000,50)');

const formSchema = z
  .object({
    kind: z.enum(CYCLE_KINDS),
    label: z.string().trim().max(120),
    declaredHeadcount: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d+$/.test(v), 'Cantidad inválida'),
    declaredAmount: amount,
    slipAmount: amount,
    paidAmount: amount,
    notes: z.string().max(1000),
    declaration: z.instanceof(File).nullable(),
    slip: z.instanceof(File).nullable(),
    payment: z.instanceof(File).nullable(),
  })
  .refine((v) => !(v.kind === 'sindical' || v.kind === 'plan_pago') || v.label.length > 0, {
    path: ['label'],
    message: 'Este dato es obligatorio para este tipo de ciclo',
  });

type FormValues = z.infer<typeof formSchema>;

const asText = (value: number | null) => (value === null ? '' : String(value).replace('.', ','));

function FileField({
  form,
  name,
  label,
  current,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  name: 'declaration' | 'slip' | 'payment';
  label: string;
  current: string | null;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
          </FormControl>
          {current && <FormDescription>Ya hay un archivo cargado; elegí otro solo para reemplazarlo.</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Alta o edición de un ciclo mensual: montos declarados, boleta y pago, y sus archivos. */
export function CycleFormDialog({
  open,
  onOpenChange,
  period,
  cycle,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: string;
  cycle: Cycle | null;
  onSaved: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      kind: cycle?.kind ?? 'f931',
      label: cycle?.label ?? '',
      declaredHeadcount: cycle?.declaredHeadcount != null ? String(cycle.declaredHeadcount) : '',
      declaredAmount: asText(cycle?.declaredAmount ?? null),
      slipAmount: asText(cycle?.slipAmount ?? null),
      paidAmount: asText(cycle?.paidAmount ?? null),
      notes: cycle?.notes ?? '',
      declaration: null,
      slip: null,
      payment: null,
    },
  });
  const kind = form.watch('kind');
  const ui = CYCLE_KIND_UI[kind];

  async function onSubmit(values: FormValues) {
    const fd = new FormData();
    if (cycle) fd.append('id', cycle.id);
    fd.append('period', period);
    fd.append('kind', values.kind);
    fd.append('label', values.label);
    fd.append('declaredHeadcount', values.declaredHeadcount);
    fd.append('declaredAmount', values.declaredAmount);
    fd.append('slipAmount', values.slipAmount);
    fd.append('paidAmount', values.paidAmount);
    fd.append('notes', values.notes);
    if (values.declaration) fd.append('declaration', values.declaration);
    if (values.slip) fd.append('slip', values.slip);
    if (values.payment) fd.append('payment', values.payment);
    const result = await saveMonthlyCycle(fd);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(cycle ? 'Ciclo actualizado' : 'Ciclo cargado');
    onSaved();
    onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!form.formState.isSubmitting) onOpenChange(next);
      }}
      title={cycle ? 'Editar ciclo mensual' : 'Cargar ciclo mensual'}
      description={`Período ${period.slice(5)}/${period.slice(0, 4)}. Lo declarado, la boleta y el pago tienen que coincidir.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={form.formState.isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" form="cycle-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Guardar
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form id="cycle-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={Boolean(cycle)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CYCLE_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {CYCLE_KIND_UI[k].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {ui.labelHint && (
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{ui.labelHint}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={Boolean(cycle)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {ui.needsHeadcount && (
              <FormField
                control={form.control}
                name="declaredHeadcount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{kind === 'recibos' ? 'Cantidad de recibos' : 'Empleados declarados'}</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {kind !== 'recibos' && kind !== 'plan_pago' && (
              <FormField
                control={form.control}
                name="declaredAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto declarado</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="0,00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {kind !== 'recibos' && (
              <>
                <FormField
                  control={form.control}
                  name="slipAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{kind === 'plan_pago' ? 'Monto de la cuota' : 'Monto de la boleta'}</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="0,00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paidAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto pagado</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="0,00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FileField
              form={form}
              name="declaration"
              label={ui.declaration}
              current={cycle?.files.declaration ?? null}
            />
            {kind !== 'recibos' && (
              <>
                {ui.needsSlip && (
                  <FileField form={form} name="slip" label="Boleta" current={cycle?.files.slip ?? null} />
                )}
                <FileField
                  form={form}
                  name="payment"
                  label="Comprobante de pago"
                  current={cycle?.files.payment ?? null}
                />
              </>
            )}
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observaciones (opcional)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </ResponsiveDialog>
  );
}
