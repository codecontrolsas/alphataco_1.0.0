'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Plus, Power, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createWithholdingRegime,
  setWithholdingRegimeActive,
  updateWithholdingRegime,
  type WithholdingRegimeRow,
} from '../../actions/withholding-regimes.server';
import {
  WITHHOLDING_TAXES,
  WITHHOLDING_TAX_LABELS,
  withholdingRegimeFormSchema,
  type WithholdingRegimeFormValues,
} from '../../schemas/payment-settings';

const logger = new Logger('Purchases/WithholdingRegimesSection');

const EMPTY: WithholdingRegimeFormValues = {
  tax: 'GANANCIAS',
  code: '',
  description: '',
  rateRegistered: '',
  rateUnregistered: '',
  monthlyExemptAmount: '',
  minimumWithholding: '',
  vatPercentage: '',
  scale: [],
};

function summary(r: WithholdingRegimeRow): string {
  if (r.tax === 'IVA') return `${r.vatPercentage ?? '—'} % del IVA`;
  const parts = [r.scale?.length ? 'Escala' : `${r.rateRegistered} %`];
  if (r.rateUnregistered) parts.push(`no inscriptos ${r.rateUnregistered} %`);
  if (Number(r.monthlyExemptAmount) > 0) parts.push(`mínimo no sujeto ${formatMoney(r.monthlyExemptAmount)}`);
  if (Number(r.minimumWithholding) > 0) parts.push(`retención mínima ${formatMoney(r.minimumWithholding)}`);
  return parts.join(' · ');
}

/** Regimenes de retencion por impuesto: alicuotas, minimos y escala (spec Compras etapa 5 §2.3). */
export function WithholdingRegimesSection({
  regimes,
  canUpdate,
}: {
  regimes: WithholdingRegimeRow[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<WithholdingRegimeRow | 'new' | null>(null);

  const form = useForm<WithholdingRegimeFormValues>({
    resolver: zodResolver(withholdingRegimeFormSchema),
    defaultValues: EMPTY,
  });
  const scale = useFieldArray({ control: form.control, name: 'scale' });
  const tax = useWatch({ control: form.control, name: 'tax' });

  const openForm = (target: WithholdingRegimeRow | 'new') => {
    form.reset(
      target === 'new'
        ? EMPTY
        : {
            tax: target.tax,
            code: target.code,
            description: target.description,
            rateRegistered: target.rateRegistered,
            rateUnregistered: target.rateUnregistered ?? '',
            monthlyExemptAmount: target.monthlyExemptAmount,
            minimumWithholding: target.minimumWithholding,
            vatPercentage: target.vatPercentage ?? '',
            scale: (target.scale ?? []).map((row) => ({
              from: row.from,
              to: row.to ?? '',
              fixed: row.fixed,
              rate: row.rate,
            })),
          }
    );
    setEditing(target);
  };

  const save = useMutation({
    mutationFn: async (values: WithholdingRegimeFormValues) =>
      unwrapAction(
        editing && editing !== 'new'
          ? await updateWithholdingRegime(editing.id, values)
          : await createWithholdingRegime(values)
      ),
    onSuccess: (_data, values) => {
      toast.success(`Régimen ${values.code} de ${WITHHOLDING_TAX_LABELS[values.tax]} guardado`);
      setEditing(null);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el régimen', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el régimen');
    },
  });

  const toggle = useMutation({
    mutationFn: async (regime: WithholdingRegimeRow) =>
      unwrapAction(await setWithholdingRegimeActive(regime.id, !regime.is_active)),
    onSuccess: (_data, regime) => {
      toast.success(regime.is_active ? `Régimen ${regime.code} desactivado` : `Régimen ${regime.code} reactivado`);
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el régimen'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Regímenes de retención</CardTitle>
          <CardDescription>
            Alícuotas y mínimos de Ganancias, IVA, IIBB y SUSS. Revisalos cuando cambien las normas: las órdenes ya
            pagadas no se recalculan.
          </CardDescription>
        </div>
        {canUpdate && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {regimes.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay regímenes. Sin régimen no se practican retenciones.
          </p>
        )}
        {WITHHOLDING_TAXES.map((t) => {
          const rows = regimes.filter((r) => r.tax === t);
          if (rows.length === 0) return null;
          return (
            <div key={t} className="space-y-1">
              <p className="text-sm font-medium">{WITHHOLDING_TAX_LABELS[t]}</p>
              <ul className="divide-y rounded-md border">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{r.code}</span>
                        <span className={r.is_active ? 'truncate text-sm' : 'truncate text-sm text-muted-foreground'}>
                          {r.description}
                        </span>
                        {!r.is_active && <Badge variant="outline">Inactivo</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground tabular-nums">{summary(r)}</p>
                    </div>
                    {canUpdate && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Editar el régimen ${r.code}`}
                          onClick={() => openForm(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={
                            r.is_active ? `Desactivar el régimen ${r.code}` : `Reactivar el régimen ${r.code}`
                          }
                          onClick={() => toggle.mutate(r)}
                          disabled={toggle.isPending}
                        >
                          {r.is_active ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Nuevo régimen' : 'Editar régimen'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="tax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Impuesto</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={editing !== 'new'}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {WITHHOLDING_TAXES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {WITHHOLDING_TAX_LABELS[t]}
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
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" maxLength={3} placeholder="078" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input placeholder="Enajenación de bienes muebles" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {tax === 'IVA' ? (
                <FormField
                  control={form.control}
                  name="vatPercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Porcentaje del IVA a retener</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="rateRegistered"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alícuota (%)</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="2" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rateUnregistered"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>No inscriptos (%)</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {tax === 'GANANCIAS' && (
                  <FormField
                    control={form.control}
                    name="monthlyExemptAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mínimo no sujeto mensual</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="0,00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="minimumWithholding"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retención mínima</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="0,00" {...field} />
                      </FormControl>
                      <FormDescription>Por debajo, no se retiene.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {tax === 'GANANCIAS' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Escala (honorarios, opcional)</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => scale.append({ from: '', to: '', fixed: '', rate: '' })}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Tramo
                    </Button>
                  </div>
                  {scale.fields.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Sobre el importe que supera el mínimo no sujeto: fijo + alícuota sobre el excedente del «desde».
                      «Hasta» vacío = sin tope.
                    </p>
                  )}
                  {scale.fields.map((f, i) => (
                    <div key={f.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
                      {(['from', 'to', 'fixed', 'rate'] as const).map((key) => (
                        <FormField
                          key={key}
                          control={form.control}
                          name={`scale.${i}.${key}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  inputMode="decimal"
                                  aria-label={{ from: 'Desde', to: 'Hasta', fixed: 'Fijo', rate: 'Alícuota' }[key]}
                                  placeholder={{ from: 'Desde', to: 'Hasta', fixed: 'Fijo', rate: '%' }[key]}
                                  {...field}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="Quitar el tramo"
                        onClick={() => scale.remove(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {form.formState.errors.scale && (
                    <p className="text-sm text-destructive">Revisá los tramos de la escala</p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
