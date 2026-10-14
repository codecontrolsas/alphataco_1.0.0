'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createDailyReport } from '../actions/mutations.server';
import { checkDailyReportExists } from '../actions/queries.server';

import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useState } from 'react';
import { DAILY_REPORTS_QUERY_KEY } from '../hooks/useDailyReports';

const FormSchema = z.object({
  date: z.date({
    required_error: 'Una fecha es requerida.',
  }),
});

/**
 * Alta de parte diario desde la barra de la tabla: un popover con la fecha. Valida que no exista
 * otro parte para el día, lo crea y lleva a su detalle.
 */
export function CreateDailyReportButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const loadingToast = toast.loading('Creando parte diario...');

    try {
      // Verificar si ya existe
      const exists = await checkDailyReportExists([moment(data.date).format('YYYY-MM-DD')]);

      if (exists.length > 0) {
        toast.dismiss(loadingToast);
        toast.error('Ya existe un parte diario para esta fecha.');
        setIsSubmitting(false);
        return;
      }

      // Crear el parte diario
      const created = await createDailyReport([moment(data.date).format('YYYY-MM-DD')]);

      toast.dismiss(loadingToast);
      toast.success('Parte diario creado exitosamente!');

      // Invalidar la query para actualizar la tabla
      queryClient.invalidateQueries({ queryKey: [...DAILY_REPORTS_QUERY_KEY] });

      // Redirigir al detalle del parte diario creado
      if (created?.[0]?.id) {
        router.push(`/dashboard/operations/${created[0].id}`);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(error instanceof Error ? error.message : 'Error al crear el parte diario');
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="brand" size="sm">
          <Plus className="mr-2 size-4" />
          Nuevo parte diario
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Crear parte diario</h2>
              <p className="text-muted-foreground text-sm">Al crearlo vas directo a cargar sus registros.</p>
            </div>
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      id="daily-report-date"
                      date={field.value}
                      setDate={field.onChange}
                      minDate={moment().startOf('day').toDate()}
                    />
                  </FormControl>
                  <FormDescription>Desde hoy en adelante.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="brand" size="sm" disabled={isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isSubmitting ? 'Creando...' : 'Crear parte diario'}
              </Button>
            </div>
          </form>
        </Form>
      </PopoverContent>
    </Popover>
  );
}
