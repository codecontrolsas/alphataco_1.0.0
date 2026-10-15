'use client';

import { getCompatibleEquipmentForHitch } from '@/features/Checklists/actions/checklist-queries';
import type { Equipment } from '@/features/Checklists/lib/checklist-form-schema';
import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Params = {
  form: UseFormReturn<FieldValues>;
  equipments: Equipment[];
  selectedEquipmentId: string | undefined;
  readOnly: boolean;
  defaultHitchEquipmentId?: string | null;
  /** El estado vive en el componente: de él depende el schema, que se crea antes que `form`. */
  setSelectedHitchEquipment: (value: string | null) => void;
};

/**
 * Estado que depende del equipo elegido: enganche (COD-290) y mínimos de kilometraje /
 * horómetro.
 *
 * Los dos `useEffect` se conservan a propósito (no se pasaron al onChange del selector):
 * `equipment_id` no cambia solo por el selector. También llega por los valores por
 * defecto del QR (el equipo viene fijo y los mínimos tienen que cargarse al montar), por
 * `form.reset()` y por el autocompletado de desarrollo. Reaccionar al valor observado
 * cubre todos esos caminos; un onChange dejaría sin mínimos al QR.
 */
export function useChecklistEquipmentSync({
  form,
  equipments,
  selectedEquipmentId,
  readOnly,
  defaultHitchEquipmentId,
  setSelectedHitchEquipment,
}: Params) {
  // Estado de enganche (COD-290)
  const [showHitchSelector, setShowHitchSelector] = useState(false);
  const [compatibleHitchEquipment, setCompatibleHitchEquipment] = useState<Equipment[]>([]);
  const [isLoadingHitchEquipment, setIsLoadingHitchEquipment] = useState(false);

  // Validación de kilometraje mínimo
  const [minKilometer, setMinKilometer] = useState<number | null>(null);
  const [kilometerError, setKilometerError] = useState<string | null>(null);

  // Validación de horómetro mínimo
  const [minEngineHours, setMinEngineHours] = useState<number | null>(null);
  const [engineHoursError, setEngineHoursError] = useState<string | null>(null);

  /**
   * Al cambiar de equipo se descarta el enganche elegido y sus equipos compatibles: son del
   * equipo anterior. En modo sólo lectura se conserva el que vino por prop.
   */
  useEffect(() => {
    if (!readOnly || !defaultHitchEquipmentId) {
      setSelectedHitchEquipment(null);
    }
    setCompatibleHitchEquipment([]);
    setShowHitchSelector(false);
  }, [selectedEquipmentId, readOnly, defaultHitchEquipmentId, setSelectedHitchEquipment]);

  // Auto-poblar kilometraje y horómetro cuando se selecciona un equipo
  useEffect(() => {
    if (!selectedEquipmentId || readOnly) {
      return;
    }

    const selectedEquipment = equipments.find((eq) => eq.value === selectedEquipmentId);
    if (selectedEquipment) {
      const equipmentKilometer = selectedEquipment.kilometer;
      const equipmentEngineHours = selectedEquipment.engine_hours;

      // Guardar el kilometraje mínimo para validación
      const kilometerNumber = equipmentKilometer ? parseInt(equipmentKilometer, 10) : null;
      setMinKilometer(isNaN(kilometerNumber!) ? null : kilometerNumber);

      // Auto-poblar el campo de kilometraje con el valor actual del equipo
      if (equipmentKilometer) {
        form.setValue('kilometraje', equipmentKilometer);
        // Limpiar cualquier error previo
        setKilometerError(null);
      }

      // Guardar el horómetro mínimo para validación
      const engineHoursNumber = equipmentEngineHours ? parseInt(equipmentEngineHours, 10) : null;
      setMinEngineHours(isNaN(engineHoursNumber!) ? null : engineHoursNumber);

      // Auto-poblar el campo de horómetro con el valor actual del equipo
      if (equipmentEngineHours) {
        form.setValue('horometro', equipmentEngineHours);
        // Limpiar cualquier error previo
        setEngineHoursError(null);
      }
    } else {
      setMinKilometer(null);
      setMinEngineHours(null);
    }
  }, [selectedEquipmentId, equipments, form, readOnly]);

  // Abre el selector de enganche y carga los equipos compatibles
  const handleOpenHitchSelector = async () => {
    if (!selectedEquipmentId) {
      const { toast } = await import('sonner');
      toast.error('Debes seleccionar un equipo primero');
      return;
    }

    setIsLoadingHitchEquipment(true);
    setShowHitchSelector(true);

    try {
      const compatibleEquipment = await getCompatibleEquipmentForHitch(selectedEquipmentId);
      setCompatibleHitchEquipment(compatibleEquipment);

      if (compatibleEquipment.length === 0) {
        const { toast } = await import('sonner');
        toast.warning('No se encontraron equipos compatibles para enganche');
      }
    } catch (error) {
      logger.error('Error loading compatible equipment', { data: { error } });
      const { toast } = await import('sonner');
      toast.error('Error al cargar equipos compatibles');
    } finally {
      setIsLoadingHitchEquipment(false);
    }
  };

  return {
    showHitchSelector,
    setShowHitchSelector,
    compatibleHitchEquipment,
    isLoadingHitchEquipment,
    handleOpenHitchSelector,
    minKilometer,
    setMinKilometer,
    kilometerError,
    setKilometerError,
    minEngineHours,
    setMinEngineHours,
    engineHoursError,
    setEngineHoursError,
  };
}
