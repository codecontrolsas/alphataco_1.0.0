'use client';

import { Button } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { YearMonthPicker } from '@/components/ui/year-month-picker';
import { fetchAllDocumentTypes } from '@/features/Documentacion/shared/actions/document-actions';
import { uploadMultiResourceDocument } from '@/features/Documentacion/shared/actions/upload-multiresource-document';
import { Logger } from '@/lib/logger';
import { calculateNameOFDocument, cn, getAllDocumentsByIdDocumentTypeCientSide } from '@/lib/utils';
import { fetchCurrentCompany } from '@/shared/actions/company.actions';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { toArgentinaValidityIso } from '../lib/document-dates';
import { DOCUMENT_FILE_ACCEPT, validateDocumentFile } from '../lib/document-file-rules';
import { createUploadMultiDocumentSchema, type UploadMultiDocumentValues } from '../schemas/upload-multi-document';

const logger = new Logger('Documentacion/UploadDocumentMultiForm');

export type MultiResourceKind = 'empleado' | 'equipo';

export interface MultiResourceOption {
  value: string;
  label: string;
  cuit?: string;
}

/** Textos y diferencias de cada tipo de recurso; el resto del formulario es idéntico. */
const RESOURCE_CONFIG = {
  empleado: {
    resourceLabel: 'Empleados',
    typeDescription: 'Seleccione el tipo de documento que desea cargar al empleado',
    folder: 'persona',
    existingTable: 'documents_employees',
    errorLog: 'Error al cargar documento multirecurso de empleados',
  },
  equipo: {
    resourceLabel: 'Equipos',
    typeDescription: 'Seleccione el tipo de documento que desea cargar al equipo',
    folder: 'equipos',
    existingTable: 'documents_equipment',
    errorLog: 'Error al cargar documento multirecurso de equipos',
  },
} as const;

type AllDocumentTypes = Awaited<ReturnType<typeof fetchAllDocumentTypes>>;

interface UploadDocumentMultiFormProps {
  resource: MultiResourceKind;
  options: MultiResourceOption[];
  allDocumentTypes: AllDocumentTypes;
  currentCompany: Awaited<ReturnType<typeof fetchCurrentCompany>>;
}

/**
 * Formulario de carga multirrecurso compartido por empleados y equipos. Sube el mismo archivo a N
 * recursos con `uploadMultiResourceDocument` (el servidor arma la ruta y valida perímetro, permisos
 * y aplicabilidad).
 */
export default function UploadDocumentMultiForm({
  resource,
  options,
  allDocumentTypes,
  currentCompany,
}: UploadDocumentMultiFormProps) {
  const config = RESOURCE_CONFIG[resource];
  const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [selectedDocumentType, setSelectedDocumentType] = useState<AllDocumentTypes[number] | undefined>(undefined);
  const [selectedResourceDocuments, setSelectedResourceDocuments] = useState<{ applies: string | null }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<UploadMultiDocumentValues>({
    resolver: zodResolver(
      createUploadMultiDocumentSchema({
        requiresValidity: Boolean(selectedDocumentType?.explired),
        requiresPeriod: Boolean(selectedDocumentType?.is_it_montlhy),
      })
    ),
    defaultValues: { applies: [] },
  });

  async function onSubmit(data: UploadMultiDocumentValues) {
    if (!selectedFile) {
      toast.error('Debe seleccionar un archivo');
      return;
    }
    if (!data.applies?.length) {
      toast.error('Debe seleccionar al menos un recurso');
      return;
    }

    setIsSubmitting(true);
    try {
      // Persistencia server-side (Prisma + transacción): evita la URL gigante de .in([cientos])
      // y completa sólo los recursos faltantes. La server action sube el archivo y, si la
      // transacción falla, lo revierte (compensación).
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('resource', resource);
      fd.append('documentTypeId', data.id_document_types);
      fd.append('appliesIds', JSON.stringify(data.applies));
      if (data.validity) fd.append('validity', data.validity);
      if (data.period) fd.append('period', data.period);
      if (resource === 'equipo' && data.policy_number) fd.append('policyNumber', data.policy_number);

      const res = await uploadMultiResourceDocument(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(`Documento cargado (${res.updated + res.created} recursos)`);
      form.reset();
      setSelectedFile(undefined);
      setSelectedDocumentType(undefined);
      setSelectedFileName('');
      // Refrescar la tabla de fondo: invalidar React Query (client-side mode) además
      // de router.refresh() para las tablas del sistema viejo (SSR).
      queryClient.invalidateQueries();
      router.refresh();
      document.getElementById('close-create-document-modal')?.click();
    } catch (error) {
      logger.error(config.errorLog, { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el documento');
    } finally {
      setIsSubmitting(false);
    }
  }

  /** Abre el selector de archivo, valida tamaño/extensión y muestra el nombre que tendrá el documento. */
  function pickFile(onPath: (path: string) => void) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = DOCUMENT_FILE_ACCEPT;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const fileError = validateDocumentFile(file);
      if (fileError) {
        toast.error(fileError);
        return;
      }
      setSelectedFile(file);
      const documentName = allDocumentTypes.find((type) => type.id === form.getValues('id_document_types'))?.name;
      const extension = file.name.split('.').pop();
      if (!options.length || !documentName || !extension) return;
      setSelectedFileName(file.name);
      const period = form.getValues('period');
      const validity = form.getValues('validity');
      // El vencimiento se guarda como medianoche argentina: se lee con su propio offset (día argentino).
      const expiredDate = validity ? moment.parseZone(validity).format('DD-MM-YYYY') : null;
      onPath(
        calculateNameOFDocument(
          currentCompany?.[0]?.company_name || '',
          currentCompany?.[0]?.company_cuit || '',
          config.folder,
          documentName,
          expiredDate || period || 'v0',
          extension,
          'multirecursos'
        )
      );
    };
    input.click();
  }

  return (
    <div>
      <CardTitle className="mb-3">Documento multirecurso</CardTitle>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 overflow-y-auto max-h-[80vh]">
          <FormField
            control={form.control}
            name="id_document_types"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Tipo de documento</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className={cn(' justify-between', !field.value && 'text-muted-foreground')}
                      >
                        {field.value
                          ? allDocumentTypes.find((documentType) => documentType.id === field.value)?.name
                          : 'Seleccionar tipo de documento'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-full">
                    <Command>
                      <CommandInput placeholder="Buscar tipo de documento" />
                      <CommandList>
                        <CommandEmpty>Sin resultados</CommandEmpty>
                        <CommandGroup>
                          {allDocumentTypes.map((documentType) => (
                            <CommandItem
                              value={documentType.id}
                              keywords={[documentType.name]}
                              key={documentType.id}
                              onSelect={async (selectedValue) => {
                                const data = await getAllDocumentsByIdDocumentTypeCientSide(
                                  selectedValue,
                                  currentCompany?.[0]?.id ?? '',
                                  config.existingTable
                                );
                                setSelectedResourceDocuments(data);
                                form.setValue('id_document_types', documentType.id);
                                setSelectedDocumentType(documentType);
                                form.setValue('validity', undefined);
                                form.setValue('period', undefined);
                                setSelectedFile(undefined);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  documentType.id === field.value ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              {documentType.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormDescription>{config.typeDescription}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="applies"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{config.resourceLabel}</FormLabel>
                <FormControl>
                  <MultiSelectCombobox
                    showSelectAll
                    selectedResourceDocuments={selectedResourceDocuments}
                    options={options.map((option) => ({
                      value: option.value,
                      label: option.cuit ? `${option.label} - ${option.cuit}` : option.label,
                      ...(option.cuit ? { cuit: option.cuit } : {}),
                    }))}
                    placeholder="Selecciona recursos"
                    emptyMessage="No se encontraron recursos."
                    selectedValues={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription>Selecciona al menos dos recursos para vincular el documento.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {selectedDocumentType?.explired && (
            <FormField
              control={form.control}
              name="validity"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de validez</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      date={field.value}
                      setDate={(date) => field.onChange(date ? toArgentinaValidityIso(date) : undefined)}
                    />
                  </FormControl>
                  <FormDescription>Seleccione la fecha de validez del documento</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {selectedDocumentType?.is_it_montlhy && (
            <FormField
              control={form.control}
              name="period"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Período</FormLabel>
                  <FormControl>
                    <YearMonthPicker
                      // `YYYY-MM` se interpreta como mes local (new Date('2026-10') sería UTC y corre el mes).
                      date={field.value ? moment(field.value, 'YYYY-MM').toDate() : undefined}
                      setDate={(date) => field.onChange(date ? moment(date).format('YYYY-MM') : undefined)}
                    />
                  </FormControl>
                  <FormDescription>Seleccione el período del documento</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {resource === 'equipo' && selectedDocumentType?.has_policy_number && (
            <FormField
              control={form.control}
              name="policy_number"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>N° de póliza</FormLabel>
                  <FormControl>
                    <Input placeholder="Ingrese el N° de póliza (opcional)" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>
                    Identificador opcional del documento (ej: número de póliza del seguro)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="document_path"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Documento</FormLabel>
                <FormControl>
                  <div className="flex items-center space-x-2">
                    <Input
                      type="text"
                      readOnly
                      value={selectedFileName || field.value || 'Ningún archivo seleccionado'}
                      className={cn('flex-grow', !field.value && 'text-muted-foreground')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!form.getValues('applies') || !form.getValues('id_document_types')}
                      onClick={() => pickFile(field.onChange)}
                    >
                      Seleccionar archivo
                    </Button>
                  </div>
                </FormControl>
                <FormDescription>Seleccione el documento que desea cargar</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-around">
            <Button
              type="button"
              variant={'destructive'}
              disabled={isSubmitting}
              onClick={() => {
                form.reset();
                setSelectedFile(undefined);
                setSelectedDocumentType(undefined);
                document.getElementById('close-create-document-modal')?.click();
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando…' : 'Enviar'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
