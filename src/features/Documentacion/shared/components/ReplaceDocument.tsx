'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toArgentinaValidityIso } from '../lib/document-dates';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { replaceDocumentFile } from '@/features/Documentacion/shared/actions/document-files.server';
import { cn } from '@/lib/utils';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { CalendarIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DOCUMENT_FILE_ACCEPT, validateDocumentFile } from '../lib/document-file-rules';
import { invalidateDocumentLists } from '../lib/document-query-keys';

export default function ReplaceDocument({
  documentName,
  resource,
  id,
  expires,
  montly,
  appliesId,
}: {
  documentName: string | null;
  resource: string | null;
  id: string;
  expires: string | null;
  montly: string | null;
  appliesId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const FormSchema = z.object({
    reeplace_document: z.string({ required_error: 'El documento es requerido' }),
    validity: expires
      ? z.date({ invalid_type_error: 'Se debe elegir una fecha', required_error: 'Se debe elegir una fecha' })
      : z.string().optional(),
    period: montly ? z.string({ required_error: 'El periodo es requerido' }).optional() : z.string().optional(),
  });

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      reeplace_document: '',
      validity: expires ?? '',
      period: montly ?? '',
    },
  });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  // "Hoy" siempre en hora argentina (el navegador puede estar en otra zona).
  const todayAr = argentinaDate();
  const today = new Date(`${todayAr}T00:00:00`);
  const nextMonth = moment(todayAr).add(1, 'month').toDate();
  const [calendarMonth, setCalendarMonth] = useState<Date>(nextMonth);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateInputValue, setDateInputValue] = useState('');
  const [dateInputError, setDateInputError] = useState('');

  async function onSubmit(values: z.infer<typeof FormSchema>) {
    if (!file) {
      form.setError('reeplace_document', {
        type: 'manual',
        message: 'El documento es requerido',
      });
      return;
    }
    if (!documentName || !appliesId) {
      toast.error('El documento no tiene archivo cargado');
      return;
    }
    const fileError = validateDocumentFile(file);
    if (fileError) {
      form.setError('reeplace_document', { type: 'manual', message: fileError });
      return;
    }

    await toast
      .promise(
        async () => {
          // Reemplazo en el servidor: borra el anterior, sube el nuevo y actualiza la fila.
          const fd = new FormData();
          fd.append('id', appliesId);
          fd.append('resource', resource ?? '');
          fd.append('file', file);
          if (values.validity instanceof Date) fd.append('validity', toArgentinaValidityIso(values.validity));
          if (values.period) fd.append('period', values.period);

          const result = await replaceDocumentFile(fd);
          if (!result.ok) throw new Error(result.error);

          await invalidateDocumentLists(queryClient);
          router.refresh();
          setIsOpen(false);
        },
        {
          loading: 'Reemplazando...',
          success: 'Documento reemplazado correctamente (puede tardar unos minutos para que se actualice)',
          error: (error: Error) => error.message,
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <DialogTrigger asChild>
        <Button variant={'outline'} className="border-2 ">
          Reemplazar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] dark:bg-slate-950">
        <DialogHeader>
          <DialogTitle>Reemplazar documento</DialogTitle>
        </DialogHeader>
        <div className="grid w-full gap-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className=" space-y-6">
              <div className="flex flex-col">
                <FormField
                  control={form.control}
                  name="reeplace_document"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nuevo Documento</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onChange={(e) => {
                            setFile(e.target.files?.[0] || null);
                            field.onChange(e);
                          }}
                          type="file"
                          accept={DOCUMENT_FILE_ACCEPT}
                        />
                      </FormControl>
                      <FormDescription>Sube el nuevo documento</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {expires && (
                  <FormField
                    control={form.control}
                    name="validity"
                    render={({ field }) => (
                      <FormItem className="flex flex-col mt-4">
                        <FormLabel>Fecha de vencimiento</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder="DD/MM/YYYY"
                              value={dateInputValue}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setDateInputValue(raw);

                                if (raw === '') {
                                  setDateInputError('');
                                  field.onChange(undefined);
                                  return;
                                }

                                const parsed = moment(raw, 'DD/MM/YYYY', true);
                                if (parsed.isValid() && parsed.isSameOrAfter(todayAr, 'day')) {
                                  setDateInputError('');
                                  field.onChange(parsed.toDate());
                                  setCalendarMonth(parsed.toDate());
                                } else if (parsed.isValid() && parsed.isBefore(todayAr, 'day')) {
                                  setDateInputError('La fecha debe ser igual o posterior a hoy');
                                  field.onChange(undefined);
                                } else {
                                  setDateInputError('Formato inválido. Use DD/MM/YYYY');
                                  field.onChange(undefined);
                                }
                              }}
                              className={cn(dateInputError ? 'border-destructive' : '')}
                            />
                          </FormControl>
                          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="shrink-0"
                                aria-label="Abrir calendario"
                              >
                                <CalendarIcon className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" align="end">
                              <Calendar
                                month={calendarMonth}
                                onMonthChange={setCalendarMonth}
                                fromDate={today}
                                mode="single"
                                selected={field.value instanceof Date ? field.value : undefined}
                                onSelect={(selected) => {
                                  if (!selected) return;
                                  const formatted = moment(selected).format('DD/MM/YYYY');
                                  setDateInputValue(formatted);
                                  setDateInputError('');
                                  field.onChange(selected);
                                  setCalendarOpen(false);
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        {dateInputError && <p className="text-sm font-medium text-destructive">{dateInputError}</p>}
                        <FormDescription>La fecha de vencimiento del documento</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {montly && (
                  <FormField
                    control={form.control}
                    name="period"
                    render={({ field }) => (
                      <FormItem className="flex flex-col mt-4">
                        <FormLabel>Periodo</FormLabel>
                        <Input
                          placeholder="Seleccionar periodo"
                          type="month"
                          onChange={(e) => {
                            form.setValue('period', e.target.value);
                          }}
                        />
                        <FormDescription>El periodo del documento</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className="text-blue-500 flex items-center">
                  <InfoCircledIcon className="size-7 inline-block mr-2" />
                  <FormDescription className="text-blue-500 mt-4">
                    Este nuevo documento reemplazara el anterior. El documento actual sera eliminado y no podra ser
                    recuperado.
                  </FormDescription>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  className="self-end mt-5"
                  disabled={form.formState.isSubmitting}
                >
                  Reemplazar
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
