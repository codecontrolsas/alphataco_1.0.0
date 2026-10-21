interface KilometerResult {
  value: string;
  source: 'checklist' | 'vehicle' | 'none';
}

interface ChecklistItem {
  maintenance_request_items?: {
    checklist_deviations?: Record<string, unknown> | null;
  } | null;
}

/**
 * Obtiene el kilometraje inicial para los formularios de Entrada a Taller.
 * Prioridad:
 * 1. Kilometraje de las respuestas del checklist (si existe y es > 0)
 * 2. Kilometraje del vehículo (fallback)
 */
export function getInitialKilometer(
  vehicleKilometer: string | number | null | undefined,
  items?: ChecklistItem[]
): KilometerResult {
  // Buscar kilometraje en las respuestas del checklist
  if (items) {
    for (const item of items) {
      const deviation = item.maintenance_request_items?.checklist_deviations;
      if (!deviation) continue;
      const checklistAnswer = (deviation as Record<string, unknown>).checklist_answers as
        | { answer_data?: { kilometraje?: string } | null }
        | null
        | undefined;
      const answerData = checklistAnswer?.answer_data;
      if (answerData?.kilometraje) {
        const kmValue = parseInt(answerData.kilometraje, 10);
        if (!isNaN(kmValue) && kmValue > 0) {
          return { value: answerData.kilometraje, source: 'checklist' };
        }
      }
    }
  }

  // Fallback: kilometraje del vehículo
  if (vehicleKilometer) {
    const kmValue = typeof vehicleKilometer === 'string' ? parseInt(vehicleKilometer, 10) : vehicleKilometer;
    if (!isNaN(kmValue) && kmValue > 0) {
      return { value: kmValue.toString(), source: 'vehicle' };
    }
  }

  return { value: '', source: 'none' };
}
