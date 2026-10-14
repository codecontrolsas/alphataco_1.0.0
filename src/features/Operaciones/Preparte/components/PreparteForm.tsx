'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { useImageUpload } from '@/shared/hooks/useUploadImage';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createPreparte, logPreparteChange } from '../actions/mutations.server';
import {
  useContratos,
  usePreparteChangeLogsInvalidation,
  usePreparteFormDependentOptions,
  useServiceItems,
} from '../hooks';
import { formSchema, type PreparteFormData, type PreparteItem } from '../schemas/preparte-form';
import { CustomerContractSection } from './preparte-form/CustomerContractSection';
import { ItemsSection } from './preparte-form/ItemsSection';
import { LocationSection } from './preparte-form/LocationSection';
import { DEFAULT_ITEM_ROW, type Contrato, type ItemRow } from './preparte-form/types';
import type { Cliente } from './PreparteManager';

const logger = new Logger('PreparteForm');

export type { PreparteFormData, PreparteItem };

interface PreparteFormProps {
  formData: PreparteItem;
  clientes: Cliente[];
  contratos: Contrato[];
  isEditing: boolean;
  onInputChange: (field: keyof PreparteItem, value: PreparteItem[keyof PreparteItem]) => void;
  onSubmit: (data: PreparteItem) => void;
  onCancel: () => void;
}

export function PreparteForm({ formData, clientes, isEditing, onInputChange, onSubmit, onCancel }: PreparteFormProps) {
  const form = useForm<PreparteItem>({
    resolver: zodResolver(formSchema),
    defaultValues: formData,
  });

  // Log para depuración de valores iniciales
  logger.debug('PreparteForm inicializado', {
    data: {
      isEditing,
      formDataItem: formData?.item,
      defaultItemValues: formData?.item ? JSON.stringify(formData.item) : 'undefined',
    },
  });

  // Log de errores del formulario en cada render (útil para depurar)
  const formErrors = form.formState.errors;
  if (Object.keys(formErrors).length > 0) {
    logger.warn('Errores activos en el formulario', {
      data: {
        errors: formErrors,
        itemErrors: formErrors.item,
      },
    });
  }

  // Hooks de invalidación para refrescar datos después de mutaciones
  const { invalidateChangeLogs } = usePreparteChangeLogsInvalidation();

  // Observar cambios en cliente y contrato para los hooks dependientes
  const watchedClienteId = form.watch('cliente_id');
  const watchedContratoId = form.watch('contrato_id');

  // Hook para obtener contratos del cliente seleccionado
  const { data: contratosData = [], isLoading: isLoadingContratos } = useContratos(watchedClienteId);
  const contratos = contratosData as Contrato[];

  // Hook para obtener items del contrato seleccionado
  const { data: serviceItemsData = [], isLoading: isLoadingItems } = useServiceItems(watchedContratoId);
  const contractItems = serviceItemsData.map((item) => ({
    label: item.item_name || `Item ${item.id}`,
    value: item.id.toString(),
  }));

  // Hook combinado para sectores, áreas y equipos
  const {
    sectors: sectorList,
    areas: areaList,
    equipments: equipmentList,
    isLoading: isLoadingDependentOptions,
    isLoadingSectors,
    isLoadingAreas,
    isLoadingEquipments,
  } = usePreparteFormDependentOptions(watchedClienteId, watchedContratoId);

  // Estado de carga combinado
  const isLoading = isLoadingContratos || isLoadingItems || isLoadingDependentOptions;

  // PP-3: Estado de items incluye fecha y subject_to_availability por ítem
  const [selectedItems, setSelectedItems] = useState<ItemRow[]>(() => {
    if (formData?.item) {
      const items = Array.isArray(formData.item)
        ? formData.item.map((i) => {
            // Si subject_to_availability es true, la fecha debe estar vacía
            const isSubjectToAvailability = i.subject_to_availability ?? false;
            const execDate = isSubjectToAvailability
              ? { from: undefined, to: undefined }
              : i.executionDate || { from: undefined, to: undefined };

            return {
              id: i.id || '',
              quantity: i.quantity || 1,
              jornada: i.jornada || '',
              tipo: i.tipo || '',
              observaciones: i.observaciones || '',
              start_time: i.start_time || '',
              end_time: i.end_time || '',
              executionDate: execDate,
              subject_to_availability: isSubjectToAvailability,
            };
          })
        : [{ ...DEFAULT_ITEM_ROW }];
      return items.length > 0 ? items : [{ ...DEFAULT_ITEM_ROW }];
    }
    return [{ ...DEFAULT_ITEM_ROW }];
  });
  // Archivo seleccionado (no forma parte del schema del formulario)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Estado para rastrear el item original (para detectar cambios en edición)
  const [originalItemId] = useState<string | null>(() => {
    if (isEditing && formData?.item) {
      const items = Array.isArray(formData.item) ? formData.item : [formData.item];
      return items[0]?.id || null;
    }
    return null;
  });

  // Estado para mostrar el campo de motivo de cambio de item
  const [showItemChangeReason, setShowItemChangeReason] = useState(false);

  const handleAddItem = () => {
    setSelectedItems((prev) => [...prev, { ...DEFAULT_ITEM_ROW }]);
  };

  const { uploadImage } = useImageUpload();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: PreparteItem) => {
    try {
      setIsSubmitting(true);

      // Validar que si se cambió el item, debe tener motivo
      if (isEditing && showItemChangeReason) {
        const itemChangeReason = data.item_change_reason?.trim();
        if (!itemChangeReason) {
          toast.error('Debe ingresar el motivo del cambio de ítem');
          form.setError('item_change_reason', {
            type: 'required',
            message: 'El motivo del cambio es obligatorio',
          });
          setIsSubmitting(false);
          return;
        }
      }

      // 1) Si hay archivo seleccionado, subirlo desde el formulario usando el hook
      if (selectedFile) {
        try {
          // El bucket es fijo: el destino del archivo no lo decide el cliente.
          const tempUrl = await uploadImage(selectedFile, 'preparte-img');
          // Guardar la URL temporal en el formulario para que el manager la procese
          form.setValue('image_url', tempUrl);
          data.image_url = tempUrl;
        } catch (e) {
          logger.error('Error subiendo archivo', { data: { error: e } });
          toast.error('No se pudo subir el archivo. Intente nuevamente.');
          return;
        }
      }

      // Registrar cambio de item en el log si corresponde
      if (isEditing && showItemChangeReason && originalItemId) {
        const newItemId = data.item?.[0]?.id;
        const oldItemName = contractItems.find((i) => i.value === originalItemId)?.label || originalItemId;
        const newItemName = contractItems.find((i) => i.value === newItemId)?.label || newItemId;

        try {
          await logPreparteChange({
            preparte_id: data.id,
            field_name: 'item',
            old_value: originalItemId,
            new_value: newItemId || null,
            reason: data.item_change_reason || '',
            metadata: {
              old_item_name: oldItemName,
              new_item_name: newItemName,
            },
          });
          // Invalidar los logs de cambios para que se refresquen en el detalle
          invalidateChangeLogs(data.id, data.numero_pedido);
        } catch (logError) {
          logger.error('Error registrando cambio de item', { data: { error: logError } });
          // No bloqueamos el guardado si falla el log, pero notificamos
          toast.warning('El cambio se guardó pero hubo un error al registrar el historial');
        }
      }

      if (data.status === 'reprogramado' && data.reprogram) {
        // PP-3: Usar los campos del primer ítem para el nuevo registro
        const firstItem = data.item[0];
        const itemObservaciones = firstItem?.observaciones || '';

        // Crear nuevo ítem con la nueva fecha
        const newItem = {
          ...data,
          id: crypto.randomUUID(),
          status: 'pendiente',
          executionDate: new Date(data.reprogram),
          item: firstItem?.id,
          jornada: firstItem?.jornada || '',
          tipo: firstItem?.tipo || '',
          observaciones: itemObservaciones,
          start_time: firstItem?.start_time || null,
          end_time: firstItem?.end_time || null,
          reprogram: data.id,
          numero_pedido: data.numero_pedido,
        };

        try {
          await createPreparte(newItem as never);
        } catch (createError) {
          logger.error('Error al crear nuevo item', { data: { error: createError } });
          throw createError;
        }

        // Actualizar ítem original
        const updatedOriginal = {
          ...data,
          status: 'reprogramado',
          // PP-3: Agregar nota de reprogramación a las observaciones del ítem
          observaciones: `[${new Date().toLocaleDateString('es-ES')}] Se reprogramó para ${format(data.reprogram, 'PPP', { locale: es })}. ${itemObservaciones}`,
        };

        try {
          await onSubmit(updatedOriginal as never);
        } catch (updateError) {
          logger.error('Error al actualizar item original', { data: { error: updateError } });
          throw updateError;
        }

        toast.success('Servicio reprogramado correctamente');
        onCancel();
        return;
      }

      // Lógica normal de guardado

      const clienteSeleccionado = clientes.find((c) => c.id === data.cliente_id);
      if (clienteSeleccionado) {
        data.cliente_id = clienteSeleccionado.id;
      }
      await onSubmit(data);
    } catch (error) {
      logger.error('Error en handleSubmit', { data: { error } });
      toast.error(`Error al guardar el servicio: ${(error as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(
            handleSubmit,
            // Handler de errores de validación
            (errors) => {
              logger.error('Errores de validación del formulario', {
                data: {
                  errors,
                  formValues: form.getValues(),
                  itemValues: form.getValues('item'),
                  selectedItems: selectedItems,
                },
              });
            }
          )}
          className="space-y-4"
        >
          <SectionCard title="Cliente y contrato">
            <div className="space-y-4">
            <CustomerContractSection
              form={form}
              clientes={clientes}
              contratos={contratos}
              isEditing={isEditing}
              isLoading={isLoading}
              isLoadingContratos={isLoadingContratos}
            />
            </div>
          </SectionCard>

          <SectionCard title="Ubicación" description="Sector, área y equipo del cliente donde se presta el servicio.">
            <div className="space-y-4">
            <LocationSection
              form={form}
              clientes={clientes}
              isEditing={isEditing}
              isLoading={isLoading}
              sectorList={sectorList}
              areaList={areaList}
              equipmentList={equipmentList}
              isLoadingSectors={isLoadingSectors}
              isLoadingAreas={isLoadingAreas}
              isLoadingEquipments={isLoadingEquipments}
            />
            </div>
          </SectionCard>

          <SectionCard title="Ítems" description="Cada ítem lleva su jornada, horario y fecha de ejecución.">
            <div className="space-y-4">
            <ItemsSection
              form={form}
              contractItems={contractItems}
              isEditing={isEditing}
              isLoading={isLoading}
              isLoadingItems={isLoadingItems}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              handleAddItem={handleAddItem}
              originalItemId={originalItemId}
              setShowItemChangeReason={setShowItemChangeReason}
            />

            {/* Campo de motivo de cambio de item (solo visible cuando se cambia el item en edición) */}
            {isEditing && showItemChangeReason && (
              <FormField
                control={form.control}
                name="item_change_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-warn-subtle-foreground">Motivo del cambio de ítem *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ingrese el motivo por el cual se está cambiando el ítem..."
                        className="bg-background border-warn/50 min-h-[80px]"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Este cambio quedará registrado en el historial del pedido.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            </div>
          </SectionCard>

          {/* Imagen del pedido - No usa FormField porque es manejado localmente */}
          <SectionCard title="Adjunto" description="Imagen o PDF del pedido del cliente (opcional).">
            {isEditing ? (
              <div className="space-y-2">
                <FormLabel>
                  {`Cambiar imagen del pedido${form?.watch('numero_pedido') ? ` (aplica a todo el N° ${form.watch('numero_pedido')})` : ''}`}
                </FormLabel>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  className="bg-background"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <FormLabel>Documento adjunto (Imagen o PDF)</FormLabel>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  className="bg-background"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  data-testid="archivo-adjunto-input"
                />
              </div>
            )}
          </SectionCard>

          <div className="bg-background/90 sticky bottom-0 -mx-4 flex justify-end gap-2 border-t px-4 py-3 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="brand"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              data-testid="guardar-preparte-button"
            >
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isSubmitting ? (isEditing ? 'Actualizando...' : 'Guardando...') : isEditing ? 'Actualizar' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
