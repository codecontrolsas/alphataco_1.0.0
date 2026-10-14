'use client';

import { useTireReturnWarehouse } from '@/features/Mantenimiento/Gomeria/shared/hooks/useTireReturnWarehouse';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  performCalibration,
  performMissingReport,
  performRepair,
  performReplace,
} from '../actions/service-order-operations.server';
import type { AvailableTire, EnsuredTirePosition } from '../actions/service-order-queries.server';
import { uploadDiscardPhoto } from '../utils/uploadDiscardPhoto';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/TirePositionActions');

export interface TirePositionActionsParams {
  position: EnsuredTirePosition;
  serviceOrderId: string;
  vehicleId: string;
  onActionComplete: () => void;
  onClose: () => void;
}

/**
 * Estado y mutaciones de las acciones sobre una posición con cubierta. Vive fuera de las
 * pestañas para que lo cargado no se pierda al cambiar de pestaña.
 */
export function useTirePositionActions({
  position,
  serviceOrderId,
  vehicleId,
  onActionComplete,
  onClose,
}: TirePositionActionsParams) {
  const queryClient = useQueryClient();

  function handleSuccess(message: string) {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ['vehicle-tire-positions', vehicleId] });
    // La que salio a disponible vuelve a ofrecerse; la que se monto deja de ofrecerse.
    void queryClient.invalidateQueries({ queryKey: ['available-tires', vehicleId] });
    onActionComplete();
    onClose();
  }

  // ─── Calibrate ──────────────────────────────────────────────────────────
  const [calibTread, setCalibTread] = useState('');
  const [calibPressStart, setCalibPressStart] = useState('');
  const [calibPressEnd, setCalibPressEnd] = useState('');
  const [calibObs, setCalibObs] = useState('');

  const calibMutation = useMutation({
    mutationFn: () =>
      performCalibration({
        serviceOrderId,
        positionNumber: position.position_number,
        vehicleId,
        tireId: position.tire_id!,
        treadDepth: calibTread ? Number(calibTread) : undefined,
        pressureStart: calibPressStart ? Number(calibPressStart) : undefined,
        pressureEnd: calibPressEnd ? Number(calibPressEnd) : undefined,
        observations: calibObs || undefined,
      }),
    onSuccess: () => handleSuccess('Calibración registrada'),
    onError: (error) => {
      logger.error('Error calibrating', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al calibrar');
    },
  });

  // ─── Repair ─────────────────────────────────────────────────────────────
  const [repairNewTire, setRepairNewTire] = useState<AvailableTire | null>(null);
  const [repairObs, setRepairObs] = useState('');

  const repairMutation = useMutation({
    mutationFn: async () => {
      if (!repairNewTire) throw new Error('Seleccione una cubierta de reemplazo');
      return unwrapAction(
        await performRepair({
          serviceOrderId,
          positionNumber: position.position_number,
          vehicleId,
          tireId: position.tire_id!,
          newTireId: repairNewTire.id,
          observations: repairObs || undefined,
        })
      );
    },
    onSuccess: () => handleSuccess('Reparación registrada'),
    onError: (error) => {
      logger.error('Error repairing', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al registrar reparación');
    },
  });

  // ─── Replace ────────────────────────────────────────────────────────────
  const [replaceNewTire, setReplaceNewTire] = useState<AvailableTire | null>(null);
  const [oldDest, setOldDest] = useState<'AVAILABLE' | 'DISCARD' | 'REPAIR'>('AVAILABLE');
  const [discardFile, setDiscardFile] = useState<File | null>(null);
  const [discardComment, setDiscardComment] = useState('');
  const [replaceTread, setReplaceTread] = useState('');
  const [replacePressStart, setReplacePressStart] = useState('');
  const [replacePressEnd, setReplacePressEnd] = useState('');
  const [replaceObs, setReplaceObs] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // La cubierta que sale a "Disponible" vuelve a un deposito si tiene stock (Almacenes etapa 6).
  const oldTireHasStock = !!position.tire?.material_unit_id;
  const returnWarehouse = useTireReturnWarehouse(vehicleId, oldTireHasStock);
  const effectiveWarehouseId = returnWarehouse.warehouseId;
  const needsWarehouse = oldDest === 'AVAILABLE' && oldTireHasStock;

  const replaceMutation = useMutation({
    mutationFn: async () => {
      if (!replaceNewTire) throw new Error('Seleccione una cubierta de reemplazo');
      if ((oldDest === 'DISCARD' || oldDest === 'REPAIR') && !discardComment) {
        throw new Error(`El motivo de ${oldDest === 'DISCARD' ? 'descarte' : 'reparación'} es obligatorio`);
      }

      let discardPhotoUrl: string | undefined;
      if ((oldDest === 'DISCARD' || oldDest === 'REPAIR') && discardFile) {
        setIsUploading(true);
        try {
          discardPhotoUrl = await uploadDiscardPhoto(discardFile, vehicleId);
        } finally {
          setIsUploading(false);
        }
      }

      return unwrapAction(
        await performReplace({
          serviceOrderId,
          positionNumber: position.position_number,
          vehicleId,
          tireId: position.tire_id!,
          newTireId: replaceNewTire.id,
          oldDestination: oldDest,
          oldTireWarehouseId: needsWarehouse ? effectiveWarehouseId || null : null,
          discardPhotoUrl,
          discardComment: oldDest === 'DISCARD' || oldDest === 'REPAIR' ? discardComment : undefined,
          treadDepth: replaceTread ? Number(replaceTread) : undefined,
          pressureStart: replacePressStart ? Number(replacePressStart) : undefined,
          pressureEnd: replacePressEnd ? Number(replacePressEnd) : undefined,
          observations: replaceObs || undefined,
        })
      );
    },
    onSuccess: () => handleSuccess('Reemplazo registrado'),
    onError: (error) => {
      logger.error('Error replacing', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al registrar reemplazo');
    },
  });

  // ─── Missing report ────────────────────────────────────────────────────
  const [missingObs, setMissingObs] = useState('');

  const missingMutation = useMutation({
    mutationFn: () =>
      performMissingReport({
        serviceOrderId,
        positionNumber: position.position_number,
        vehicleId,
        tireId: position.tire_id!,
        observations: missingObs || undefined,
      }),
    onSuccess: () => handleSuccess('Cubierta reportada como extraviada'),
    onError: (error) => {
      logger.error('Error reporting missing', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al reportar extravío');
    },
  });

  const isPending =
    calibMutation.isPending ||
    repairMutation.isPending ||
    replaceMutation.isPending ||
    missingMutation.isPending ||
    isUploading;

  return {
    isPending,
    isUploading,
    calibration: {
      tread: calibTread,
      setTread: setCalibTread,
      pressStart: calibPressStart,
      setPressStart: setCalibPressStart,
      pressEnd: calibPressEnd,
      setPressEnd: setCalibPressEnd,
      obs: calibObs,
      setObs: setCalibObs,
      mutation: calibMutation,
    },
    repair: {
      newTire: repairNewTire,
      setNewTire: setRepairNewTire,
      obs: repairObs,
      setObs: setRepairObs,
      mutation: repairMutation,
    },
    replace: {
      newTire: replaceNewTire,
      setNewTire: setReplaceNewTire,
      oldDest,
      setOldDest,
      setDiscardFile,
      discardComment,
      setDiscardComment,
      tread: replaceTread,
      setTread: setReplaceTread,
      pressStart: replacePressStart,
      setPressStart: setReplacePressStart,
      pressEnd: replacePressEnd,
      setPressEnd: setReplacePressEnd,
      obs: replaceObs,
      setObs: setReplaceObs,
      returnWarehouse,
      effectiveWarehouseId,
      needsWarehouse,
      mutation: replaceMutation,
    },
    missing: {
      obs: missingObs,
      setObs: setMissingObs,
      mutation: missingMutation,
    },
  };
}

export type TirePositionActions = ReturnType<typeof useTirePositionActions>;
