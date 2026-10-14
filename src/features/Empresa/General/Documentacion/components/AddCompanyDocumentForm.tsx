'use client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useCountriesStore } from '@/shared/store/countries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { uploadCompanyDocument } from '../mutations.server';
function AddCompanyDocumentForm({
  documentId,
  documentIsUploaded,
  redirectId,
  documentTypeName,
  documentTypeExplired,
  documentTypeMontlhy,
}: {
  documentId: string;
  redirectId: string;
  documentIsUploaded: boolean;
  /** Nombre del tipo de documento — si se pasa, evita buscar en el store */
  documentTypeName?: string;
  /** Si el tipo de documento vence */
  documentTypeExplired?: boolean;
  /** Si el tipo de documento es mensual */
  documentTypeMontlhy?: boolean;
}) {
  const companyDocumentTypes = (useCountriesStore((state) => state.companyDocumentTypes) ?? []).filter(
    (e) => e.applies === 'Empresa'
  );
  // Si se pasaron props directas, usarlas; si no, buscar en el store
  const documentForId = documentTypeName
    ? {
        id: documentId,
        name: documentTypeName,
        explired: documentTypeExplired ?? false,
        is_it_montlhy: documentTypeMontlhy ?? false,
      }
    : companyDocumentTypes.find((e) => e.id === documentId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const FormSchema = z.object({
    id_document_types: z.string({
      required_error: 'Este campo es requerido',
    }),
    file: z.string({ required_error: 'Este campo es requerido' }),
    validity: documentForId?.explired ? z.string({ required_error: 'Este campo es requerido' }) : z.string().optional(),
    period: documentForId?.is_it_montlhy
      ? z.string({
          required_error: 'Este campo es requerido',
        })
      : z.string().optional(),
  });
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id_document_types: documentId,
    },
  });
  const [file, setFile] = useState<File | undefined>(undefined);

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    await toast
      .promise(
        async () => {
          if (!file) throw new Error('No se ha subido el archivo');
          // El archivo, el tipo, la validez y el período viajan al servidor: la empresa y el usuario
          // salen de la sesión (nunca del cliente) y el storage se toca en el servidor.
          const formData = new FormData();
          formData.set('file', file);
          formData.set('documentTypeId', data.id_document_types);
          if (data.validity) formData.set('validity', data.validity);
          if (data.period) formData.set('period', data.period);

          const result = await uploadCompanyDocument(formData);
          if (!result.ok) throw new Error(result.error);

          queryClient.invalidateQueries();
          router.refresh();
        },
        {
          loading: 'Subiendo documento',
          success: () => {
            document.getElementById('cerrar-modal-company-document')?.click();
            return 'Documento subido con exito';
          },
          error: (error) => {
            return error instanceof Error ? error.message : String(error);
          },
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  }

  return documentIsUploaded ? (
    <Link
      className={cn(buttonVariants({ variant: 'outline' }), 'min-w-full')}
      href={`/dashboard/document/${redirectId}?resource=Empresa`}
    >
      Ver documento
    </Link>
  ) : (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" className="min-w-full">
          Subir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Subir documento</AlertDialogTitle>
          <AlertDialogDescription>Rellena el siguiente formulario para subir el documento</AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className=" space-y-6">
            <FormField
              control={form.control}
              name="id_document_types"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de documento</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Tipos de documento" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {documentTypeName ? (
                        <SelectItem key={documentId} value={documentId}>
                          {documentTypeName}
                        </SelectItem>
                      ) : (
                        companyDocumentTypes.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="file"
              render={({ field: { value, onChange, ...fieldRest } }) => (
                <FormItem>
                  <FormLabel>Archivo</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Elegir Archivo"
                      type="file"
                      {...fieldRest}
                      onChange={(event) => {
                        setFile(event.target.files?.[0]);
                        onChange(event);
                      }}
                    />
                  </FormControl>
                  <FormDescription>Selecciona el archivo a subir</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {documentForId?.explired && (
              <FormField
                control={form.control}
                name="validity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de vencimiento</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Elegir Archivo"
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Selecciona la fecha en la que vence el documento</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {documentForId?.is_it_montlhy && (
              <FormField
                control={form.control}
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Periodo</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Elegir Archivo"
                        type="month"
                        min={new Date().toISOString().split('T')[0]}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Este documento es mensual, debe ingrear el periodo al que corresponde
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="flex justify-end gap-4">
              <AlertDialogCancel id="cerrar-modal-company-document">Cancelar</AlertDialogCancel>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Subir
              </Button>
            </div>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default AddCompanyDocumentForm;
