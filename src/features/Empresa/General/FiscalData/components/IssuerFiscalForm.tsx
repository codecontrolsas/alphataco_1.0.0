'use client';

import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCuit } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { zodResolver } from '@hookform/resolvers/zod';
import moment from 'moment';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { saveFiscalProfile } from '../actions/fiscal-data.server';
import type { FiscalDataOverview } from '../lib/fiscal-data-overview.server';
import {
  GROSS_INCOME_REGIMES,
  GROSS_INCOME_REGIME_LABELS,
  TAX_CONDITIONS,
  TAX_CONDITION_LABELS,
  TAX_CONDITION_LETTERS,
  fiscalProfileSchema,
  type FiscalProfileValues,
} from '../schemas/fiscal-data';
import { FiscalSection } from './FiscalSection';

/** Valor del Select de régimen que representa "sin dato" (Radix no admite `''` como item). */
const NO_REGIME = 'none';

type Props = {
  company: FiscalDataOverview['company'];
  profile: FiscalDataOverview['profile'];
  provinces: { id: string; name: string }[];
  canUpdate: boolean;
};

/** Datos fiscales del emisor: lo que se imprime en cada comprobante. */
export function IssuerFiscalForm({ company, profile, provinces, canUpdate }: Props) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);

  const form = useForm<FiscalProfileValues>({
    resolver: zodResolver(fiscalProfileSchema),
    defaultValues: {
      tax_condition: profile?.tax_condition,
      gross_income_regime: profile?.gross_income_regime ?? null,
      gross_income_number: profile?.gross_income_number ?? null,
      activity_start_date: profile?.activity_start_date ?? '',
      fiscal_street: profile?.fiscal_street ?? '',
      fiscal_city: profile?.fiscal_city ?? '',
      fiscal_province_id: profile?.fiscal_province_id ?? '',
      fiscal_postal_code: profile?.fiscal_postal_code ?? '',
    },
  });

  const taxCondition = form.watch('tax_condition');

  async function onSubmit(values: FiscalProfileValues) {
    if (!canUpdate) return;
    setSaveError(null);
    const result = await saveFiscalProfile(values);
    if (!result.ok) {
      setSaveError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success('Datos fiscales guardados.');
    router.refresh();
  }

  return (
    <FiscalSection
      id="datos-del-emisor"
      title="Datos fiscales del emisor"
      description="Se imprimen en cada comprobante que emitas."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <fieldset
            disabled={!canUpdate || form.formState.isSubmitting}
            className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2"
          >
            {/* Razón social y CUIT: se editan en Empresa, acá solo se muestran. */}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium">Razón social</span>
              <p className="truncate" title={company.name}>
                {company.name}
              </p>
              <Link
                href="/dashboard/configuration?tab=general&subtab=company"
                className="text-primary w-fit text-sm underline-offset-4 hover:underline"
              >
                Editar en Empresa
              </Link>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">CUIT</span>
              <p className="tabular-nums">{formatCuit(company.cuit)}</p>
            </div>

            <FormField
              control={form.control}
              name="tax_condition"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Condición frente al IVA</FormLabel>
                  <FormControl>
                    <RadioGroup
                      aria-label="Condición frente al IVA"
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                    >
                      {TAX_CONDITIONS.map((condition) => (
                        <label
                          key={condition}
                          htmlFor={`tax-condition-${condition}`}
                          className="has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/5 has-[:focus-visible]:ring-ring/50 flex cursor-pointer items-start gap-3 border p-4 has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-[3px]"
                        >
                          <RadioGroupItem id={`tax-condition-${condition}`} value={condition} className="mt-0.5" />
                          <span className="flex flex-col gap-1">
                            <span className="text-sm font-medium">{TAX_CONDITION_LABELS[condition]}</span>
                            <span className="text-muted-foreground text-xs">{TAX_CONDITION_LETTERS[condition]}</span>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    {taxCondition
                      ? TAX_CONDITION_LETTERS[taxCondition]
                      : 'Define qué tipo de factura emitís (A, B o C).'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gross_income_regime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ingresos Brutos: régimen</FormLabel>
                  <Select
                    value={field.value ?? NO_REGIME}
                    onValueChange={(value) =>
                      field.onChange(value === NO_REGIME ? null : (value as FiscalProfileValues['gross_income_regime']))
                    }
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Elegí el régimen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={NO_REGIME}>Sin informar</SelectItem>
                        {GROSS_INCOME_REGIMES.map((regime) => (
                          <SelectItem key={regime} value={regime}>
                            {GROSS_INCOME_REGIME_LABELS[regime]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gross_income_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ingresos Brutos: número de inscripción</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      spellCheck={false}
                      autoComplete="off"
                      className="tabular-nums"
                      placeholder="901-123456-7"
                    />
                  </FormControl>
                  <FormDescription>Se imprime en la factura. Dejalo vacío si no corresponde.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="activity_start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inicio de actividades</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      date={field.value || undefined}
                      setDate={(date) => field.onChange(date ? moment(date).format('YYYY-MM-DD') : '')}
                    />
                  </FormControl>
                  <FormDescription>Se imprime en la factura.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fiscal_street"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Domicilio fiscal: calle y número</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="street-address" placeholder="Av. San Martín 1234, piso 2" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fiscal_city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localidad</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="address-level2" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fiscal_province_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provincia</FormLabel>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Elegí la provincia" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {provinces.map((province) => (
                          <SelectItem key={province.id} value={province.id}>
                            {province.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fiscal_postal_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código postal</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoComplete="postal-code"
                      spellCheck={false}
                      className="tabular-nums uppercase"
                      placeholder="Q8300"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>

          <div className="flex flex-col items-end gap-2">
            {saveError && (
              <p role="alert" className="text-destructive text-sm">
                {saveError}
              </p>
            )}
            <Button type="submit" variant="brand" disabled={!canUpdate || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Guardando…' : 'Guardar datos fiscales'}
            </Button>
          </div>
        </form>
      </Form>
    </FiscalSection>
  );
}
