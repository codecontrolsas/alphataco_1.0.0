'use client';

import { Logger } from '@/lib/logger';
import { useImageUpload } from '@/shared/hooks/useUploadImage';
import { zodResolver } from '@hookform/resolvers/zod';
import moment from 'moment';
import 'moment/locale/es';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createPreparte, logPreparteChange } from '../actions/mutations.server';
import { DEFAULT_ITEM_ROW, type Contrato, type ItemRow } from '../components/preparte-form/types';
import { formSchema, type PreparteItem } from '../schemas/preparte-form';
import { useContratos, usePreparteChangeLogsInvalidation, usePreparteFormDependentOptions, useServiceItems } from './index';

const logger = new Logger('PreparteForm');

interface UsePreparteFormControllerOptions {
  formData: PreparteItem;
  isEditing: boolean;
  onSubmit: (data: PreparteItem) => void | Promise<void>;
  onCancel: () => void;
}

/** Líneas de ítem iniciales del formulario a partir de los datos recibidos (PP-3: fecha y disponibilidad por ítem). */
function buildInitialItemRows(formData: PreparteItem): ItemRow[] {
  if (!formData?.item) return [{ ...DEFAULT_ITEM_ROW }];

  const rows = Array.isArray(formData.item)
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

  return rows.length > 0 ? rows : [{ ...DEFAULT_ITEM_ROW }];
}

/**
 * Estado y envío del formulario de pedido (compartido por la variante Sheet y la de página):
 * el form de RHF, las opciones dependientes de cliente/contrato, las líneas de ítem, el archivo
 * adjunto y el `handleSubmit` con sus efectos (subida, historial de cambio de ítem, reprogramación).
 */
export function usePreparteFormController({ formData, isEditing, onSubmit, onCancel }: UsePreparteFormControllerOptions) {
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
  const [selectedItems, setSelectedItems] = useState<ItemRow[]>(() => buildInitialItemRows(formData));
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

      // El estado "reprogramado" se puede elegir en el selector de estado del formulario de edición
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
          observaciones: `[${new Date().toLocaleDateString('es-ES')}] Se reprogramó para ${moment(data.reprogram).locale('es').format('LL')}. ${itemObservaciones}`,
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
      await onSubmit(data);
    } catch (error) {
      logger.error('Error en handleSubmit', { data: { error } });
      toast.error(`Error al guardar el servicio: ${(error as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Handler del `<form>`: valida con el schema y, si falla, deja el detalle en el log. */
  const submitHandler = form.handleSubmit(handleSubmit, (errors) => {
    logger.error('Errores de validación del formulario', {
      data: {
        errors,
        formValues: form.getValues(),
        itemValues: form.getValues('item'),
        selectedItems,
      },
    });
  });

  return {
    form,
    contratos,
    contractItems,
    isLoading,
    isLoadingContratos,
    isLoadingItems,
    sectorList,
    areaList,
    equipmentList,
    isLoadingSectors,
    isLoadingAreas,
    isLoadingEquipments,
    selectedItems,
    setSelectedItems,
    handleAddItem,
    originalItemId,
    showItemChangeReason,
    setShowItemChangeReason,
    setSelectedFile,
    isSubmitting,
    submitHandler,
  };
}

export type PreparteFormController = ReturnType<typeof usePreparteFormController>;
