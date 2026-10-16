'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Power, Truck, User, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { document_applies } from '@/generated/prisma/enums';
import { useDebounce } from '@/shared/hooks/useDebounce';

import { createDocumentType, updateDocumentType } from '../actions/mutations.server';
import { countMatchingResources, getDocumentTypeForEdit, type DocumentTypeListItem } from '../actions/queries.server';
import { createEmptyConditionsState, type ConditionsState } from '../config/documentConditions';
import { EQUIPMENT_TYPE_OPTIONS, type EquipmentType } from '../config/equipmentTypes';
import {
  documentTypeFormSchema as formSchema,
  type DocumentTypeFormValues as FormValues,
} from '../schemas/document-type-form.schema';
import {
  conditionsJsonToSelections,
  hasActiveConditions,
  mergeConditions,
  selectionsToConditionsJson,
} from '../utils/conditionsMapper';
import { _ConditionsSection } from './_ConditionsSection';
import { _RulePreviewPanel } from './_RulePreviewPanel';
import { _ToggleDocTypeDialog } from './_ToggleDocTypeDialog';
import { _VerifyDocumentsDialog } from './_VerifyDocumentsDialog';

// ============================================
// CONSTANTES
// ============================================

const APPLIES_OPTIONS = [
  { value: document_applies.Persona, label: 'Empleados', icon: User },
  { value: document_applies.Equipos, label: 'Equipos', icon: Truck },
  { value: document_applies.Empresa, label: 'Empresa', icon: Building2 },
] as const;

// ============================================
// TIPOS
// ============================================

interface DocumentTypeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType?: DocumentTypeListItem | null;
  defaultApplies?: document_applies;
  permissionsMap?: Record<string, boolean>;
}

// ============================================
// COMPONENTE
// ============================================

export function _DocumentTypeFormModal({
  open,
  onOpenChange,
  documentType,
  defaultApplies = document_applies.Persona,
  permissionsMap,
}: DocumentTypeFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!documentType;

  // --- Estado de verificación ---
  const [verifyOpen, setVerifyOpen] = useState(false);
  // --- Estado de confirmación activar/desactivar ---
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);

  // --- Estado de condiciones (fuera del form, paralelo) ---
  const [isSpecial, setIsSpecial] = useState(false);
  const [conditions, setConditions] = useState<ConditionsState>(() => createEmptyConditionsState(defaultApplies));
  const [initialNamesMap, setInitialNamesMap] = useState<Record<string, Map<string, string>>>({});

  // Ref mutable para namesMap que se actualiza al hacer selecciones
  const namesMapRef = useRef<Record<string, Map<string, string>>>({});

  // --- React Hook Form ---
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      applies: defaultApplies,
      equipment_type: null,
      mandatory: false,
      explired: false,
      is_it_montlhy: false,
      private: false,
      down_document: false,
      available_for_pre_file: false,
      multiresource: false,
      has_policy_number: false,
      description: '',
    },
  });

  const applies = form.watch('applies');
  const multiresource = form.watch('multiresource');

  // --- Lazy-load condiciones en modo edición ---
  const hydratedForIdRef = useRef<string | null>(null);

  const { data: editData, isLoading: isLoadingEdit } = useQuery({
    queryKey: ['document-type-edit', documentType?.id],
    queryFn: () => getDocumentTypeForEdit(documentType!.id),
    enabled: open && isEditing && !!documentType?.id,
    staleTime: 0,
  });

  // Hidratar form y condiciones cuando llegan datos de edición
  // (useEffect válido: sincronización con datos externos de React Query)
  useEffect(() => {
    if (!editData || !documentType?.id) return;
    if (hydratedForIdRef.current === documentType.id) return;
    hydratedForIdRef.current = documentType.id;

    form.reset({
      name: editData.name,
      applies: editData.applies,
      equipment_type: editData.equipment_type ?? null,
      mandatory: editData.mandatory,
      explired: editData.explired,
      is_it_montlhy: editData.is_it_montlhy ?? false,
      private: editData.private ?? false,
      down_document: editData.down_document ?? false,
      available_for_pre_file: editData.available_for_pre_file ?? false,
      multiresource: editData.multiresource,
      has_policy_number: editData.has_policy_number ?? false,
      description: editData.description ?? '',
    });

    setIsSpecial(editData.special);
    const conditionsArray = editData.conditions as unknown[];
    if (Array.isArray(conditionsArray) && conditionsArray.length > 0) {
      const parsed = conditionsJsonToSelections(conditionsArray as Parameters<typeof conditionsJsonToSelections>[0]);
      setConditions(parsed.selections);
      setInitialNamesMap(parsed.namesMap);
      namesMapRef.current = parsed.namesMap;
    } else {
      setConditions(createEmptyConditionsState(editData.applies));
      setInitialNamesMap({});
      namesMapRef.current = {};
    }
  }, [editData, documentType?.id, form]);

  // --- Contador de coincidencias (live) ---
  const debouncedConditions = useDebounce(conditions, 500);
  const hasActive = hasActiveConditions(debouncedConditions);

  const conditionsJson = useMemo(
    () => (isSpecial && hasActive ? selectionsToConditionsJson(debouncedConditions, applies, namesMapRef.current) : []),
    [isSpecial, hasActive, debouncedConditions, applies]
  );

  const { data: matchCount, isLoading: isCountLoading } = useQuery({
    queryKey: ['condition-match-count', applies, conditionsJson, documentType?.id ?? null],
    queryFn: () =>
      countMatchingResources(applies, conditionsJson as Parameters<typeof countMatchingResources>[1], documentType?.id),
    enabled: isSpecial && hasActive && applies !== 'Empresa',
    staleTime: 10_000,
  });

  // Condiciones del borrador SIN debounce: "Probar regla" evalúa lo que hay en pantalla al hacer click.
  const liveConditionsJson = useMemo(
    () =>
      isSpecial && hasActiveConditions(conditions)
        ? selectionsToConditionsJson(conditions, applies, namesMapRef.current)
        : [],
    [isSpecial, conditions, applies]
  );

  // --- Mutaciones ---
  const createMutation = useMutation({
    mutationFn: createDocumentType,
    onSuccess: () => {
      toast.success('Tipo de documento creado');
      queryClient.invalidateQueries({ queryKey: ['doc-types'] });
      handleClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Error al crear tipo');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateDocumentType>[1] }) =>
      updateDocumentType(id, data),
    onSuccess: () => {
      toast.success('Tipo de documento actualizado');
      queryClient.invalidateQueries({ queryKey: ['doc-types'] });
      handleClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar tipo');
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  // --- Verificar documentos (visibilidad del botón) ---
  const mandatory = form.watch('mandatory');
  const isMonthly = form.watch('is_it_montlhy');
  const canVerify =
    isEditing &&
    mandatory &&
    !isMonthly &&
    applies !== 'Empresa' &&
    permissionsMap?.[`configuracion:${applies === 'Persona' ? 'tipos-docs-personas' : 'tipos-docs-equipos'}:update`] ===
      true;

  // --- Handlers ---
  const handleConditionsChange = useCallback((partial: Partial<ConditionsState>) => {
    setConditions((prev) => mergeConditions(prev, partial));
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset al cerrar
    hydratedForIdRef.current = null;
    form.reset({
      name: '',
      applies: defaultApplies,
      equipment_type: null,
      mandatory: false,
      explired: false,
      is_it_montlhy: false,
      private: false,
      down_document: false,
      available_for_pre_file: false,
      multiresource: false,
      has_policy_number: false,
      description: '',
    });
    setIsSpecial(false);
    setConditions(createEmptyConditionsState(defaultApplies));
    setInitialNamesMap({});
    namesMapRef.current = {};
  }, [onOpenChange, form, defaultApplies]);

  const handleAppliesChange = useCallback(
    (value: document_applies) => {
      form.setValue('applies', value);
      // Reset multiresource si cambia a Empresa
      if (value === 'Empresa') {
        form.setValue('multiresource', false);
      }
      // N° de póliza solo aplica a Equipos: limpiar si cambia a otro recurso
      if (value !== 'Equipos') {
        form.setValue('has_policy_number', false);
      }
      // Reset condiciones al cambiar tipo
      setConditions(createEmptyConditionsState(value));
      setIsSpecial(false);
    },
    [form]
  );

  // Opciones del tipo: una tarjeta por casilla. `visible` respeta qué aplica a cada recurso.
  const options = useMemo(
    () =>
      [
        { name: 'mandatory', label: 'Obligatorio', description: 'Se le exige a todos los que aplican', visible: true },
        {
          name: 'explired',
          label: 'Con vencimiento',
          description: 'Hay que cargar la fecha de vencimiento',
          visible: true,
        },
        { name: 'is_it_montlhy', label: 'Mensual', description: 'Se pide un documento por período', visible: true },
        { name: 'private', label: 'Privado', description: 'Solo lo ven quienes tienen permiso', visible: true },
        {
          name: 'down_document',
          label: 'Documento de baja',
          description: 'Documentación de egreso del recurso dado de baja',
          visible: true,
        },
        // Ticket 505: habilita el tipo en el checklist de un candidato
        {
          name: 'available_for_pre_file',
          label: 'Puede cargarse desde un candidato',
          description: 'Se puede pedir antes del ingreso',
          visible: applies === 'Persona',
        },
        {
          name: 'multiresource',
          label: 'Multirrecurso',
          description: 'Un mismo archivo sirve para varios recursos',
          visible: applies !== 'Empresa',
          // N° de póliza depende de multirecurso: limpiar al destildar
          onChange: (checked: boolean) => {
            if (!checked) form.setValue('has_policy_number', false);
          },
        },
        // N° de póliza: solo para tipos de Equipos multirecurso
        {
          name: 'has_policy_number',
          label: 'Lleva N° de póliza',
          description: 'Se registra el número de póliza',
          visible: applies === 'Equipos' && multiresource,
        },
      ] satisfies {
        name: keyof FormValues;
        label: string;
        description: string;
        visible: boolean;
        onChange?: (checked: boolean) => void;
      }[],
    [applies, multiresource, form]
  );

  const onSubmit = useCallback(
    (values: FormValues) => {
      // Validar que si es especial, tenga al menos una condición
      if (isSpecial && !hasActiveConditions(conditions)) {
        toast.error('Debe seleccionar al menos una condición');
        return;
      }

      const conditionsPayload = isSpecial
        ? selectionsToConditionsJson(conditions, values.applies, namesMapRef.current)
        : [];

      const payload = {
        name: values.name,
        applies: values.applies,
        equipment_type: values.applies === 'Equipos' ? ((values.equipment_type ?? null) as EquipmentType | null) : null,
        mandatory: values.mandatory,
        explired: values.explired,
        special: isSpecial,
        multiresource: values.multiresource,
        // El flag solo es válido para tipos de Equipos multirecurso
        has_policy_number: values.applies === 'Equipos' && values.multiresource ? values.has_policy_number : false,
        is_it_montlhy: values.is_it_montlhy,
        private: values.private,
        down_document: values.down_document,
        // Solo tiene sentido en documentos de personas (el candidato es de un postulante)
        available_for_pre_file: values.applies === 'Persona' ? values.available_for_pre_file : false,
        description: values.description || undefined,
        conditions: conditionsPayload as Parameters<typeof createDocumentType>[0]['conditions'],
      };

      if (isEditing && documentType) {
        updateMutation.mutate({ id: documentType.id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    },
    [isSpecial, conditions, isEditing, documentType, createMutation, updateMutation]
  );

  // --- Render ---
  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[650px]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>{isEditing ? 'Editar Tipo de Documento' : 'Nuevo Tipo de Documento'}</DialogTitle>
                <DialogDescription>
                  {isEditing
                    ? 'Modifica los datos del tipo de documento'
                    : 'Configura un nuevo tipo de documento para tu empresa'}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto py-4">
                {isLoadingEdit && isEditing ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Cargando datos...</span>
                  </div>
                ) : (
                  <div className="grid gap-4 pr-2">
                    {/* Nombre */}
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: Licencia de conducir" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Aplica a */}
                    <FormField
                      control={form.control}
                      name="applies"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel id="applies-label">Aplica a *</FormLabel>
                          <div
                            role="radiogroup"
                            aria-labelledby="applies-label"
                            className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
                          >
                            {APPLIES_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                role="radio"
                                aria-checked={field.value === opt.value}
                                disabled={isEditing}
                                onClick={() => handleAppliesChange(opt.value)}
                                className="text-muted-foreground aria-checked:bg-card aria-checked:text-foreground aria-checked:ring-border focus-visible:ring-ring/50 flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-60 aria-checked:shadow-xs aria-checked:ring-1"
                              >
                                <opt.icon className="size-4" aria-hidden />
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Tipo de equipo (solo si applies === Equipos) */}
                    {applies === 'Equipos' && (
                      <FormField
                        control={form.control}
                        name="equipment_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de equipo</FormLabel>
                            <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar tipo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {EQUIPMENT_TYPE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Opciones */}
                    <div className="space-y-3">
                      <FormLabel>Opciones</FormLabel>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {options
                          .filter((option) => option.visible)
                          .map((option) => (
                            <FormField
                              key={option.name}
                              control={form.control}
                              name={option.name}
                              render={({ field }) => (
                                <FormItem>
                                  <label className="hover:bg-accent/50 has-[:focus-visible]:ring-ring/50 flex h-full cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-[3px]">
                                    <FormControl>
                                      <Checkbox
                                        className="mt-0.5"
                                        checked={field.value}
                                        onCheckedChange={(checked) => {
                                          field.onChange(checked);
                                          option.onChange?.(checked === true);
                                        }}
                                      />
                                    </FormControl>
                                    <span className="space-y-0.5">
                                      <span className="block text-sm font-medium">{option.label}</span>
                                      <span className="text-muted-foreground block text-sm text-pretty">
                                        {option.description}
                                      </span>
                                    </span>
                                  </label>
                                </FormItem>
                              )}
                            />
                          ))}
                      </div>
                    </div>

                    {/* Descripción */}
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Descripción opcional" rows={2} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Sección de Condiciones */}
                    <_ConditionsSection
                      applies={applies}
                      isSpecial={isSpecial}
                      onIsSpecialChange={setIsSpecial}
                      conditions={conditions}
                      onConditionsChange={handleConditionsChange}
                      disabled={isPending || isLoadingEdit}
                      initialNamesMap={initialNamesMap}
                    />

                    {/* Impacto: a cuántos recursos se les exigiría */}
                    {isSpecial && hasActive && applies !== 'Empresa' && (
                      <div
                        className="bg-warn-subtle text-warn-subtle-foreground flex items-center gap-2 rounded-lg p-3 text-sm"
                        role="status"
                        aria-live="polite"
                      >
                        <Users className="size-4 shrink-0" aria-hidden />
                        {isCountLoading ? (
                          <span>Calculando coincidencias…</span>
                        ) : (
                          <span>
                            Se le exigirá a <strong>{matchCount?.matching ?? 0}</strong>{' '}
                            {applies === 'Persona' ? 'empleado' : 'equipo'}
                            {(matchCount?.matching ?? 0) !== 1 ? 's' : ''} que coinciden con las condiciones
                            configuradas.
                            {isEditing &&
                              matchCount &&
                              (matchCount.startsRequiring > 0 || matchCount.stopsRequiring > 0) && (
                                <>
                                  {' '}
                                  Con este cambio, {matchCount.startsRequiring} empezarán a exigirlo y{' '}
                                  {matchCount.stopsRequiring} dejarán de exigirlo.
                                </>
                              )}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Probar regla: panel de solo lectura dentro del formulario (sin modal) */}
                    {isSpecial && hasActive && (applies === 'Persona' || applies === 'Equipos') && (
                      <_RulePreviewPanel
                        applies={applies}
                        conditionsJson={liveConditionsJson as Parameters<typeof countMatchingResources>[1]}
                        documentTypeId={documentType?.id}
                      />
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-shrink-0 pt-4 sm:justify-between">
                <div className="flex gap-2">
                  {isEditing && documentType && (
                    <Button
                      type="button"
                      variant={documentType.is_active ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => setToggleDialogOpen(true)}
                      disabled={isPending}
                    >
                      <Power className="mr-1 h-3.5 w-3.5" />
                      {documentType.is_active ? 'Desactivar' : 'Activar'}
                    </Button>
                  )}
                  {canVerify && documentType && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setVerifyOpen(true)}>
                      Verificar documentos
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isPending || form.formState.isSubmitting || isLoadingEdit}>
                    {isPending ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
          {isEditing && documentType ? (
            <_ToggleDocTypeDialog
              open={toggleDialogOpen}
              onOpenChange={setToggleDialogOpen}
              documentType={documentType}
              onSuccess={handleClose}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {canVerify && documentType && (
        <_VerifyDocumentsDialog
          open={verifyOpen}
          onOpenChange={setVerifyOpen}
          documentTypeId={documentType.id}
          documentTypeName={documentType.name}
          applies={applies as 'Persona' | 'Equipos'}
          isSpecial={isSpecial}
        />
      )}
    </>
  );
}
