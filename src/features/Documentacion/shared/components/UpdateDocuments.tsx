'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toArgentinaValidityIso } from '../lib/document-dates';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { renewDocumentFile } from '@/features/Documentacion/shared/actions/document-files.server';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DOCUMENT_FILE_ACCEPT, validateDocumentFile } from '../lib/document-file-rules';
import { invalidateDocumentLists } from '../lib/document-query-keys';

export default function UpdateDocuments({
  documentName,
  resource,
  id,
  expires,
  montly,
}: {
  documentName: string | null;
  resource: string | null;
  id: string;
  expires: boolean;
  montly: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const FormSchema = z.object({
    new_document: z.string({ required_error: 'El documento es requerido' }),
    validity: expires ? z.date({ invalid_type_error: 'Se debe elegir una fecha' }) : z.string().optional(),
    period: montly ? z.string({ required_error: 'El periodo es requerido' }) : z.string().optional(),
  });

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      validity: '',
      new_document: '',
      period: '',
    },
  });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  // Mínimo del calendario: el día de hoy en Argentina (no el del navegador).
  const today = new Date(`${argentinaDate()}T00:00:00`);
  async function onSubmit(values: z.infer<typeof FormSchema>) {
    if (!file) {
      form.setError('new_document', {
        type: 'manual',
        message: 'El documento es requerido',
      });
      return;
    }
    if (!documentName) {
      toast.error('El documento no tiene archivo cargado');
      return;
    }
    const fileError = validateDocumentFile(file);
    if (fileError) {
      form.setError('new_document', { type: 'manual', message: fileError });
      return;
    }

    await toast
      .promise(
        async () => {
          // Renovación en el servidor: archiva el vigente, sube el nuevo y actualiza la fila.
          const fd = new FormData();
          fd.append('id', id);
          fd.append('resource', resource ?? '');
          fd.append('file', file);
          if (values.validity instanceof Date) fd.append('validity', toArgentinaValidityIso(values.validity));
          if (values.period) fd.append('period', values.period);

          const result = await renewDocumentFile(fd);
          if (!result.ok) throw new Error(result.error);

          await invalidateDocumentLists(queryClient);
          router.refresh();
          setIsOpen(false);
        },
        {
          loading: 'Renovando...',
          success: 'Documento renovado correctamente',
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
        <Button>Renovar</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] dark:bg-slate-950">
        <DialogHeader>
          <DialogTitle>Renovar documento</DialogTitle>
        </DialogHeader>
        <div className="grid w-full gap-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className=" space-y-6">
              <div className="flex flex-col ">
                <div className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="new_document"
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
                          <FormControl>
                            <EnhancedDatePicker
                              date={field.value as Date | string | undefined}
                              setDate={(value) => field.onChange(value)}
                              minDate={today}
                              placeholder="DD/MM/YYYY"
                            />
                          </FormControl>
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
                        <FormItem className="flex flex-col">
                          <FormLabel>Periodo</FormLabel>
                          <Input
                            placeholder="Elige una periodo"
                            type="month"
                            onChange={(e) => {
                              form.setValue('period', e.target.value);
                            }}
                            defaultValue={field.value}
                          />
                          <FormDescription>La fecha de vencimiento del documento</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="text-blue-500 flex items-center">
                  <InfoCircledIcon className="size-7 inline-block mr-2" />
                  <FormDescription className="text-blue-500 mt-4">
                    Este nuevo documento sera el nuevo documento vigente y el anterior sera almacenado en la historia.
                  </FormDescription>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  className="self-end mt-5"
                  disabled={form.formState.isSubmitting}
                >
                  Renovar
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
