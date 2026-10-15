'use client';

import { AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CardDescription } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { uploadDocumentForRequirement } from '@/features/Documentacion/shared/actions/document-actions';
import {
  getActiveDocumentTypesByResource,
  getActiveResourcesForDocuments,
  type DocumentResource,
  type DocumentResourceOption,
} from '@/features/Documentacion/shared/actions/document-resources.server';
import { uploadMultiResourceDocument } from '@/features/Documentacion/shared/actions/upload-multiresource-document';
import { cn } from '@/lib/utils';
import { CaretSortIcon } from '@radix-ui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { toArgentinaValidityIso } from '../lib/document-dates';
import { DOCUMENT_FILE_ACCEPT, validateDocumentFile } from '../lib/document-file-rules';
import { invalidateDocumentLists } from '../lib/document-query-keys';
import type { SimpleDocumentForm } from '../schemas/simple-document';

type TypeFilter = 'Ambos' | 'Permanentes' | 'Mensuales';

/**
 * Modal "Subir documento" de las tablas de documentos (empleados/equipos).
 *
 * Única vía de subida: `uploadMultiResourceDocument` (N=1 para un recurso; todos los recursos
 * activos si el tipo es multirecurso). El servidor arma el nombre del archivo, verifica que el
 * recurso pertenezca a la empresa activa y toca el storage.
 */
export default function SimpleDocument({
  resource,
  handleOpen,
  defaultDocumentId,
  numberDocument,
  requirement,
  onUploaded,
}: {
  resource: string | undefined;
  handleOpen: () => void;
  defaultDocumentId?: string;
  document?: string;
  numberDocument?: string;
  /**
   * Exigencia faltante (modelo derivado: no hay una fila de documento que actualizar). Fija el recurso
   * y el tipo, y sube con `uploadDocumentForRequirement` en vez de la vía genérica.
   */
  requirement?: {
    kind: 'employee' | 'vehicle';
    resourceId: string;
    documentTypeId: string;
    /** Período `YYYY-MM` precargado (fila faltante de un tipo mensual). */
    period?: string;
  };
  /**
   * Refresco extra tras subir. Las listas de documentos (React Query) ya se refrescan solas;
   * las pantallas que renderizan en el servidor (SSR) deben pasar `() => router.refresh()`.
   */
  onUploaded?: () => void;
}) {
  const resourceKind: DocumentResource = requirement
    ? requirement.kind === 'vehicle'
      ? 'equipo'
      : 'empleado'
    : resource === 'equipo'
      ? 'equipo'
      : 'empleado';
  const lockedResourceKey = requirement?.resourceId ?? numberDocument;
  const presetDocumentId = requirement?.documentTypeId ?? defaultDocumentId;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const searchParams = useSearchParams();
  const documentResource = searchParams.get('document');
  // `?id=` sólo identifica al recurso en el detalle de un equipo (trae el id del vehículo ahí).
  const id = resourceKind === 'equipo' ? searchParams.get('id') : null;

  const { data: documentTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: ['document-types-by-resource', resourceKind],
    queryFn: () => getActiveDocumentTypesByResource(resourceKind),
    staleTime: 5 * 60 * 1000,
  });
  const { data: resources = [], isLoading: loadingResources } = useQuery({
    queryKey: ['document-resources', resourceKind],
    queryFn: () => getActiveResourcesForDocuments(resourceKind),
    staleTime: 5 * 60 * 1000,
  });

  // Preseleccion del recurso: numberDocument (id o serie/domain/DNI), el searchParam `document`
  // (DNI del empleado) o el searchParam `id` (detalle de equipo trae el id del vehiculo ahi).
  const lockedResource = useMemo<DocumentResourceOption | undefined>(() => {
    const keys = [lockedResourceKey, documentResource, id].filter((k): k is string => !!k);
    if (keys.length === 0) return undefined;
    return resources.find((r) => keys.includes(r.id) || keys.includes(r.document));
  }, [resources, lockedResourceKey, documentResource, id]);
  const isLocked = Boolean(lockedResourceKey || documentResource || id);

  const form = useForm<SimpleDocumentForm>({
    defaultValues: {
      applies: '',
      id_document_types: presetDocumentId ?? '',
      validity: '',
      period: requirement?.period ?? '',
    },
  });
  const {
    control,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
    setValue,
    watch,
  } = form;

  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('Ambos');
  const [resourceSearch, setResourceSearch] = useState('');
  const [openResourceSelector, setOpenResourceSelector] = useState(false);
  const [openDocumentTypePopover, setOpenDocumentTypePopover] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const visibleDocumentTypes = useMemo(() => {
    if (typeFilter === 'Permanentes') return documentTypes.filter((t) => !t.is_it_montlhy);
    if (typeFilter === 'Mensuales') return documentTypes.filter((t) => t.is_it_montlhy);
    return documentTypes;
  }, [documentTypes, typeFilter]);

  const selectedTypeId = watch('id_document_types');
  const selectedType = documentTypes.find((t) => t.id === selectedTypeId);
  const hasExpired = Boolean(selectedType?.explired);
  const isMonthly = Boolean(selectedType?.is_it_montlhy);

  const filteredResources = useMemo(() => {
    const query = resourceSearch.toLowerCase();
    if (!query) return resources;
    const isNumberInput = /^\d+$/.test(query);
    return resources.filter((r) =>
      isNumberInput ? r.document?.includes(query) : r.name.toLowerCase().includes(query) || r.document?.includes(query)
    );
  }, [resources, resourceSearch]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    if (file) setFileError(null);
  };

  const onSubmit = async (formData: SimpleDocumentForm) => {
    if (!selectedFile) {
      setFileError('El archivo es obligatorio');
      return;
    }
    const invalidFile = validateDocumentFile(selectedFile);
    if (invalidFile) {
      setFileError(invalidFile);
      return;
    }
    const docType = documentTypes.find((t) => t.id === formData.id_document_types);
    if (!docType) {
      setError('id_document_types', { type: 'required', message: 'Este campo es requerido' });
      return;
    }

    // Multirecurso: aplica a TODOS los recursos ACTIVOS (la lista ya viene filtrada por is_active;
    // los dados de baja quedan excluidos y sus documentos existentes no se tocan).
    const targetIds =
      docType.multiresource && !requirement
        ? resources.map((r) => r.id)
        : [requirement?.resourceId ?? lockedResource?.id ?? formData.applies].filter(Boolean);
    if (targetIds.length === 0) {
      if (docType.multiresource) {
        toast.error('No se encontraron recursos activos para vincular el documento');
      } else {
        setError('applies', { type: 'required', message: 'Este campo es requerido' });
      }
      return;
    }

    const validityDate = formData.validity ? new Date(toArgentinaValidityIso(formData.validity)) : null;
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('resource', resourceKind);
    fd.append('documentTypeId', docType.id);
    fd.append('appliesIds', JSON.stringify(targetIds));
    if (formData.validity) fd.append('validity', toArgentinaValidityIso(formData.validity));
    if (formData.period) fd.append('period', formData.period);

    toast.promise(
      async () => {
        setLoading(true);
        try {
          const result = requirement
            ? await uploadDocumentForRequirement({
                kind: requirement.kind,
                resourceId: requirement.resourceId,
                documentTypeId: docType.id,
                file: selectedFile,
                validity: validityDate,
                period: formData.period || undefined,
              })
            : await uploadMultiResourceDocument(fd);
          if (!result.ok) {
            if ('code' in result && result.code === 'ALREADY_UPLOADED') {
              setError('id_document_types', { type: 'validate', message: result.error });
            }
            throw new Error(result.error);
          }
        } finally {
          setLoading(false);
        }
      },
      {
        loading: 'Subiendo...',
        success: () => {
          handleOpen();
          // Refrescar solo las listas de documentos (React Query y sus facets), sin recargar la ruta
          void invalidateDocumentLists(queryClient);
          // Refresco extra para consumidores del sistema viejo (SSR) que no usan React Query
          onUploaded?.();
          if (fileInputRef.current) fileInputRef.current.value = '';
          setSelectedFile(null);
          return 'Documento subido correctamente';
        },
        error: (error: Error) => error.message,
      }
    );
  };

  const handleNestedFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    handleSubmit(onSubmit)();
  };

  const resourceLabel = resourceKind === 'equipo' ? 'equipo' : 'empleado';

  return (
    <Form {...form}>
      <form onSubmit={handleNestedFormSubmit}>
        <div className="space-y-4">
          {!documentResource && (
            <div className="space-y-2 py-3">
              <Label className="block">{resourceKind === 'equipo' ? 'Equipos' : 'Empleados'}</Label>
              {loadingResources ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Controller
                  render={({ field }) => {
                    const selectedId = lockedResource?.id ?? field.value;
                    const selectedName = resources.find((r) => r.id === selectedId)?.name;
                    return (
                      <Popover open={openResourceSelector} onOpenChange={setOpenResourceSelector}>
                        <PopoverTrigger disabled={isLocked} asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(' justify-between w-full', !selectedName && 'text-muted-foreground')}
                          >
                            {selectedName ?? `Seleccionar ${resourceLabel}`}
                            <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className=" p-0">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder={`Buscar ${resourceLabel}`}
                              className="h-9"
                              value={resourceSearch}
                              onValueChange={setResourceSearch}
                            />
                            <CommandList>
                              <CommandEmpty>No se encontraron resultados</CommandEmpty>
                              <CommandGroup>
                                {filteredResources.map((option) => (
                                  <CommandItem
                                    value={option.id}
                                    key={option.id}
                                    onSelect={() => {
                                      field.onChange(option.id);
                                      clearErrors('applies');
                                      setOpenResourceSelector(false);
                                    }}
                                  >
                                    {option.name}
                                    <CheckIcon
                                      className={cn(
                                        'ml-auto h-4 w-4',
                                        option.id === selectedId ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    );
                  }}
                  name="applies"
                  control={control}
                  rules={isLocked ? {} : { required: 'Este campo es requerido' }}
                />
              )}
              <CardDescription>Selecciona el {resourceLabel} al que deseas vincular el documento</CardDescription>
              {errors.applies?.message && (
                <CardDescription className="text-red-700 mt-0 m-0">{errors.applies.message}</CardDescription>
              )}
            </div>
          )}

          <div className="space-y-2">
            {!presetDocumentId && (
              <ToggleGroup
                value={typeFilter}
                type="single"
                variant="outline"
                className="w-full flex-col items-start mb-4 gap-y-3"
                onValueChange={(value) => {
                  if (value === 'Ambos' || value === 'Permanentes' || value === 'Mensuales') setTypeFilter(value);
                }}
              >
                <Label>Filtrar tipos de documentos</Label>
                <div className="flex gap-4">
                  <ToggleGroupItem value="Ambos">Ambos</ToggleGroupItem>
                  <ToggleGroupItem value="Permanentes">Permanentes</ToggleGroupItem>
                  <ToggleGroupItem value="Mensuales">Mensuales</ToggleGroupItem>
                </div>
              </ToggleGroup>
            )}
            <Label>Seleccione el tipo de documento a vincular al recurso</Label>
            {loadingTypes ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Controller
                render={({ field }) => (
                  <Popover open={openDocumentTypePopover} onOpenChange={setOpenDocumentTypePopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn('justify-between w-full', !field.value && 'text-muted-foreground')}
                      >
                        {field.value
                          ? documentTypes.find((t) => t.id === field.value)?.name ?? 'Seleccionar documento'
                          : 'Seleccionar documento'}
                        <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 overflow-y-auto max-h-[50vh]">
                      <Command className="p-2">
                        <CommandInput placeholder="Buscar documento" className="h-9" />
                        <CommandList>
                          <CommandEmpty>Documento no encontrado</CommandEmpty>
                          <CommandGroup>
                            {visibleDocumentTypes.map((documentType) => (
                              <CommandItem
                                value={documentType.name}
                                key={documentType.id}
                                onSelect={() => {
                                  clearErrors('id_document_types');
                                  setValue('id_document_types', documentType.id);
                                  setValue('validity', '');
                                  setValue('period', '');
                                  setOpenDocumentTypePopover(false);
                                }}
                              >
                                {documentType.name}
                                <CheckIcon
                                  className={cn(
                                    'ml-auto h-4 w-4',
                                    documentType.id === field.value ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
                name="id_document_types"
                control={control}
                rules={{ required: 'Este campo es requerido' }}
              />
            )}
            {errors.id_document_types && (
              <CardDescription className="text-red-700 m-0">{errors.id_document_types.message}</CardDescription>
            )}
          </div>

          <div className="space-y-2">
            <Label>Documento *</Label>
            <Input
              id="file-input"
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept={DOCUMENT_FILE_ACCEPT}
              className="cursor-pointer"
            />
            {selectedFile && <p className="text-sm text-muted-foreground">Archivo seleccionado: {selectedFile.name}</p>}
            <CardDescription>Sube el documento que deseas vincular a los recursos</CardDescription>
            {fileError && <CardDescription className="text-red-700 mt-0">{fileError}</CardDescription>}
          </div>

          {hasExpired && (
            <FormField
              control={control}
              name="validity"
              rules={{ required: 'La fecha de vencimiento es requerida' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de vencimiento *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" placeholder="Seleccione la fecha de vencimiento" />
                  </FormControl>
                  <FormMessage />
                  <CardDescription>La fecha de vencimiento del documento</CardDescription>
                </FormItem>
              )}
            />
          )}

          {isMonthly && (
            <div className="space-y-2">
              <div className="flex flex-col gap-3">
                <Label>Periodo</Label>
                <Controller
                  render={({ field }) => (
                    <Input
                      placeholder="Seleccionar periodo"
                      type="month"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                  name="period"
                  control={control}
                  rules={{ required: 'Falta seleccionar el periodo' }}
                />
              </div>
              {errors.period && (
                <CardDescription className="text-red-700 mt-0">{errors.period.message}</CardDescription>
              )}
              <CardDescription>El documento es mensual, debe seleccioar el periodo al que aplica</CardDescription>
            </div>
          )}

          <Separator />
        </div>

        <div className="flex justify-evenly mt-4">
          <AlertDialogCancel className="text-black dark:bg-white hover:text-black/50" asChild>
            <Button type="button" onClick={() => handleOpen()}>
              Cancelar
            </Button>
          </AlertDialogCancel>

          <Button disabled={loading || loadingTypes || loadingResources} type="submit">
            {loading ? 'Enviando' : 'Enviar documento'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
