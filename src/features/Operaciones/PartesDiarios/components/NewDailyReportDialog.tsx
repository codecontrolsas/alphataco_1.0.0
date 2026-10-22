'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createDailyReport } from '../actions/mutations.server';
import { checkDailyReportExists } from '../actions/queries.server';
import { DAILY_REPORTS_QUERY_KEY } from '../list/constants';

const formSchema = z.object({
  date: z.date({ required_error: 'La fecha es requerida.' }),
});

type FormValues = z.infer<typeof formSchema>;

/** Botón "Nuevo parte" + diálogo para crear un parte diario vacío. */
export function NewDailyReportDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Tras crear el parte se navega al detalle: el botón queda bloqueado para no crear dos veces.
  const [isCreated, setIsCreated] = useState(false);

  // Se permite desde ayer (hora argentina), igual que el formulario anterior.
  const minDate = useMemo(() => moment(argentinaDate(), 'YYYY-MM-DD').subtract(1, 'day').toDate(), []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });
  const { isSubmitting } = form.formState;

  const handleOpenChange = (next: boolean) => {
    // No se cierra ni se limpia mientras se guarda o ya se creó (navegación en curso)
    if (!next && (isSubmitting || isCreated)) return;
    setOpen(next);
    if (!next) form.reset();
  };

  const onSubmit = async (values: FormValues) => {
    const date = moment(values.date).format('YYYY-MM-DD');
    if (moment(date).isBefore(minDate, 'day')) {
      form.setError('date', { message: 'La fecha no puede ser anterior a ayer.' });
      return;
    }

    try {
      const exists = await checkDailyReportExists([date]);
      if (exists.length > 0) {
        form.setError('date', { message: 'Ya existe un parte diario para esta fecha.' });
        return;
      }

      const created = await createDailyReport([date]);
      const createdId = created?.[0]?.id;

      toast.success('Parte diario creado correctamente');
      queryClient.invalidateQueries({ queryKey: [...DAILY_REPORTS_QUERY_KEY] });

      if (createdId) {
        setIsCreated(true);
        router.push(`/dashboard/operations/${createdId}`);
      } else {
        setOpen(false);
        form.reset();
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear el parte diario');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo parte
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo parte diario</DialogTitle>
          <DialogDescription>Se crea vacío. Después podés clonar líneas de otro día.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha del parte</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      date={field.value}
                      setDate={(date) => field.onChange(date)}
                      minDate={minDate}
                      placeholder="DD/MM/AAAA"
                    />
                  </FormControl>
                  <FormDescription>Un solo parte por día.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting || isCreated}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || isCreated}>
                {isSubmitting || isCreated ? 'Creando...' : 'Crear parte'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
