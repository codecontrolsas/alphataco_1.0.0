'use client';

import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Logger } from '@/lib/logger';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { Fragment } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import {
  saveSupplierWithholdingProfiles,
  type SupplierWithholdingProfile,
} from '../../actions/withholding-profiles.server';
import type { WithholdingRegimeRow } from '../../actions/withholding-regimes.server';
import {
  WITHHOLDING_STATUS_LABELS,
  WITHHOLDING_TAXES,
  WITHHOLDING_TAX_LABELS,
  withholdingProfilesFormSchema,
  type WithholdingProfilesFormValues,
  type WithholdingTax,
} from '../../schemas/payment-settings';

const logger = new Logger('Purchases/SupplierTaxProfile');

function toValues(profiles: SupplierWithholdingProfile[]): WithholdingProfilesFormValues {
  const one = (tax: WithholdingTax) => {
    const p = profiles.find((x) => x.tax === tax);
    return {
      status: p?.status ?? ('NONE' as const),
      regimeId: p?.regimeId ?? '',
      rate: p?.rate ?? '',
      exclusionPercentage: p?.exclusion?.percentage ?? '',
      exclusionFrom: p?.exclusion?.from ?? '',
      exclusionTo: p?.exclusion?.to ?? '',
      exclusionCertificate: p?.exclusion?.certificate ?? '',
    };
  };
  return { profiles: { GANANCIAS: one('GANANCIAS'), IVA: one('IVA'), IIBB: one('IIBB'), SUSS: one('SUSS') } };
}

/**
 * Situacion del proveedor frente a cada retencion (spec Compras etapa 5 §2.3): si se le retiene,
 * con que regimen, la alicuota de padron de IIBB y el certificado de exclusion con su vigencia.
 */
export function SupplierTaxProfile({
  supplierId,
  profiles,
  regimes,
  canUpdate,
}: {
  supplierId: string;
  profiles: SupplierWithholdingProfile[];
  regimes: WithholdingRegimeRow[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const form = useForm<WithholdingProfilesFormValues>({
    resolver: zodResolver(withholdingProfilesFormSchema),
    defaultValues: toValues(profiles),
  });

  const save = useMutation({
    mutationFn: async (values: WithholdingProfilesFormValues) =>
      unwrapAction(await saveSupplierWithholdingProfiles(supplierId, values)),
    onSuccess: () => {
      toast.success('Situación impositiva guardada');
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar la situación impositiva', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    },
  });

  return (
    <SectionCard
      title="Situación impositiva"
      description="Qué se le retiene al pagarle. Sin régimen o con «No aplica», ese impuesto no se retiene. Los regímenes se cargan en Configuración de Compras."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
          {WITHHOLDING_TAXES.map((tax, i) => (
            <Fragment key={tax}>
              {i > 0 && <Separator />}
              <TaxRow
                form={form}
                tax={tax}
                regimes={regimes.filter((r) => r.tax === tax && r.is_active)}
                disabled={!canUpdate}
              />
            </Fragment>
          ))}
          {canUpdate && (
            <div className="flex justify-end">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Guardando…' : 'Guardar situación impositiva'}
              </Button>
            </div>
          )}
        </form>
      </Form>
    </SectionCard>
  );
}

function TaxRow({
  form,
  tax,
  regimes,
  disabled,
}: {
  form: UseFormReturn<WithholdingProfilesFormValues>;
  tax: WithholdingTax;
  regimes: WithholdingRegimeRow[];
  disabled: boolean;
}) {
  const status = useWatch({ control: form.control, name: `profiles.${tax}.status` });
  const exclusion = useWatch({ control: form.control, name: `profiles.${tax}.exclusionPercentage` });
  const applies = status === 'SUBJECT' || status === 'NOT_REGISTERED';
  const date = (value: string) => (value ? moment(value, 'YYYY-MM-DD').toDate() : undefined);

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_1fr] sm:items-end">
        <p className="text-sm font-medium sm:pb-2">{WITHHOLDING_TAX_LABELS[tax]}</p>
        <FormField
          control={form.control}
          name={`profiles.${tax}.status`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Situación</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="NONE">No aplica</SelectItem>
                  {(Object.keys(WITHHOLDING_STATUS_LABELS) as (keyof typeof WITHHOLDING_STATUS_LABELS)[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {WITHHOLDING_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {applies && (
          <FormField
            control={form.control}
            name={`profiles.${tax}.regimeId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Régimen</FormLabel>
                <Select
                  value={field.value || (tax === 'IIBB' ? 'none' : '')}
                  onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={regimes.length ? 'Elegí el régimen' : 'Sin regímenes cargados'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tax === 'IIBB' && <SelectItem value="none">Sin régimen (solo alícuota de padrón)</SelectItem>}
                    {regimes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.code} · {r.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
      {applies && (
        <div className="grid gap-3 sm:grid-cols-4">
          {tax === 'IIBB' && (
            <FormField
              control={form.control}
              name={`profiles.${tax}.rate`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alícuota de padrón (%)</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="1,75" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name={`profiles.${tax}.exclusionPercentage`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Exclusión (%)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" placeholder="Sin exclusión" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {exclusion && (
            <>
              <FormField
                control={form.control}
                name={`profiles.${tax}.exclusionFrom`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vigente desde</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        date={date(field.value)}
                        setDate={(d) => field.onChange(d ? moment(d).format('YYYY-MM-DD') : '')}
                        placeholder="DD/MM/AAAA"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`profiles.${tax}.exclusionTo`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hasta</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        date={date(field.value)}
                        setDate={(d) => field.onChange(d ? moment(d).format('YYYY-MM-DD') : '')}
                        placeholder="DD/MM/AAAA"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`profiles.${tax}.exclusionCertificate`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certificado</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
