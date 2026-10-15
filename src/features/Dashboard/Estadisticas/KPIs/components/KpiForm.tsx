'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createKPI, updateKPI } from '../actions/actions';
import { useInvalidateKpiQueries } from '../hooks/useInvalidateKpiQueries';
import { useKpiStore } from '../store/kpi.store';

const KpiSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'Debe ingresar el nombre del KPI' }),
  number: z.string().optional(),
  validity_date: z.string().min(1, { message: 'Debe ingresar la fecha de vigencia' }),
  calculation_formula: z.string().min(1, { message: 'Debe ingresar la fórmula de cálculo' }),
  improvement_opportunities: z.string().optional(),
  is_active: z.boolean().optional(),
});

type KpiFormValues = z.infer<typeof KpiSchema>;

const DEFAULT_VALUES: KpiFormValues = {
  id: '',
  name: '',
  number: '',
  validity_date: '',
  calculation_formula: '',
  improvement_opportunities: '',
  is_active: true,
};

export function KpiForm() {
  const editingKpi = useKpiStore((state) => state.kpi);
  const { invalidateKpiChart, invalidateAllKpiCharts } = useInvalidateKpiQueries();
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const form = useForm<KpiFormValues>({
    resolver: zodResolver(KpiSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { reset } = form;
  const isSubmitting = form.formState.isSubmitting;
  const router = useRouter();

  // Derivar isEditing del store — no necesita estado local propio
  const isEditing = !!editingKpi;

  // Sincronizar store → form cuando cambia el KPI editado
  // useEffect es válido aquí porque editingKpi es estado externo (Zustand store)
  useEffect(() => {
    if (editingKpi) {
      reset({
        id: editingKpi.id,
        name: editingKpi.name,
        number: editingKpi.number ?? '',
        validity_date: editingKpi.validity_date,
        calculation_formula: editingKpi.calculation_formula,
        improvement_opportunities: editingKpi.improvement_opportunities ?? '',
        is_active: editingKpi.is_active ?? true,
      });
    } else {
      reset(DEFAULT_VALUES);
    }
  }, [editingKpi, reset]);

  const resetForm = () => {
    reset(DEFAULT_VALUES);
    useKpiStore.getState().setKpi(null);
    closeSheet();
  };

  const invalidateTable = (code?: string | null) => {
    queryClient.invalidateQueries({ queryKey: ['kpis-indicadores-paginated'] });
    if (code) {
      invalidateKpiChart(code as Parameters<typeof invalidateKpiChart>[0]);
    } else {
      invalidateAllKpiCharts();
    }
  };

  const onSubmit = async (values: KpiFormValues) => {
    setBusy(true);
    await toast
      .promise(
        async () => {
          const result = await createKPI({
            name: values.name,
            number: values.number || undefined,
            validity_date: values.validity_date,
            calculation_formula: values.calculation_formula,
            is_active: values.is_active ?? true,
          });
          if (result.error) throw result.error;
          return result;
        },
        {
          loading: 'Creando KPI...',
          success: (result) => {
            invalidateTable(result?.data?.code);
            resetForm();
            router.refresh();
            return 'KPI creado correctamente';
          },
          error: (error) => {
            setBusy(false);
            return error?.message || 'Error al crear el KPI';
          },
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  };

  const onUpdate = async (values: KpiFormValues) => {
    setBusy(true);
    await toast
      .promise(
        async () => {
          const result = await updateKPI({
            id: values.id!,
            name: values.name,
            number: values.number || undefined,
            calculation_formula: values.calculation_formula,
            improvement_opportunities: values.improvement_opportunities || undefined,
            is_active: values.is_active ?? true,
          });
          if (result.error) throw result.error;
          return result;
        },
        {
          loading: 'Actualizando KPI...',
          success: (result) => {
            invalidateTable(editingKpi?.code ?? result?.data?.code);
            resetForm();
            router.refresh();
            return 'KPI actualizado correctamente';
          },
          error: (error) => {
            setBusy(false);
            return error?.message || 'Error al actualizar el KPI';
          },
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  };

  const handleSubmit = async (values: KpiFormValues) => {
    if (isEditing) {
      await onUpdate(values);
    } else {
      await onSubmit(values);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del KPI</FormLabel>
              <FormControl>
                <Input type="text" {...field} className="input w-full" placeholder="Nombre del KPI" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número (Umbral)</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  {...field}
                  className="input w-full"
                  placeholder="Ej: 85.5 (porcentaje objetivo)"
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!isEditing && (
          <FormField
            control={form.control}
            name="validity_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de Vigencia</FormLabel>
                <FormControl>
                  <Input type="date" {...field} className="input w-full" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="calculation_formula"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fórmula de Cálculo</FormLabel>
              <FormControl>
                <Textarea {...field} className="input w-full min-h-[100px]" placeholder="Fórmula de cálculo" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isEditing && (
          <FormField
            control={form.control}
            name="improvement_opportunities"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Oportunidades de Mejora</FormLabel>
                <FormControl>
                  <Textarea {...field} className="input w-full min-h-[80px]" placeholder="Oportunidades de mejora" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Activo</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => field.onChange(value === 'true')}
                  value={field.value ? 'true' : 'false'}
                  className="flex space-x-1"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="true" />
                    </FormControl>
                    <FormLabel className="font-normal">Activo</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="false" />
                    </FormControl>
                    <FormLabel className="font-normal">Inactivo</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 mt-6">
          <Button type="submit" variant={'brand'} disabled={isSubmitting}>
            {isSubmitting ? (isEditing ? 'Actualizando...' : 'Creando...') : isEditing ? 'Actualizar' : 'Crear'}
          </Button>
          <Button type="button" onClick={resetForm} variant="outline" disabled={isSubmitting}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
