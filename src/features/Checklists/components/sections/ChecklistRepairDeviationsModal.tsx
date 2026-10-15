'use client';

import type { Equipment } from '@/features/Checklists/lib/checklist-form-schema';
import { getChecklistRedirectPath } from '@/features/Checklists/lib/checklist-redirect';
import type { getPendingDeviations } from '@/features/Mantenimiento/actions/maintenance-actions';
import { CriticalDeviationsRepairModal } from '@/features/Mantenimiento/shared/components/critical-deviations-repair-modal';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';

type ChecklistRepairDeviationsModalProps = {
  isOpen: boolean;
  /** Cierra el modal y limpia el formulario; la redirección la resuelve este componente. */
  onReset: () => void;
  deviations: Awaited<ReturnType<typeof getPendingDeviations>>;
  hitchDeviationIds: Set<string>;
  equipments: Equipment[];
  compatibleHitchEquipment: Equipment[];
  selectedHitchEquipment: string | null;
  equipmentId: string;
  checklistAnswerId?: string;
  driverEmployeeId?: string;
};

/** Modal para generar solicitudes de reparación desde los desvíos del checklist recién guardado. */
export function ChecklistRepairDeviationsModal({
  isOpen,
  onReset,
  deviations,
  hitchDeviationIds,
  equipments,
  compatibleHitchEquipment,
  selectedHitchEquipment,
  equipmentId,
  checklistAnswerId,
  driverEmployeeId,
}: ChecklistRepairDeviationsModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();

  /** Etiquetas legibles de cada unidad, para aclarar en el modal a quién se imputa el desvío. */
  const utEquipmentLabel = useMemo(
    () => equipments.find((eq) => eq.value === equipmentId)?.label ?? null,
    [equipments, equipmentId]
  );
  const hitchEquipmentLabel = useMemo(
    () =>
      compatibleHitchEquipment.find((eq) => eq.value === selectedHitchEquipment)?.label ??
      equipments.find((eq) => eq.value === selectedHitchEquipment)?.label ??
      null,
    [compatibleHitchEquipment, equipments, selectedHitchEquipment]
  );

  return (
    <CriticalDeviationsRepairModal
      isOpen={isOpen}
      onClose={() => {
        onReset();
        // Redirigir a la lista de respuestas con delay para que el Dialog termine su animación
        setTimeout(() => {
          router.push(getChecklistRedirectPath(pathname, equipmentId));
          queryClient.invalidateQueries();
          router.refresh();
        }, 300);
      }}
      onComplete={() => {
        onReset();
        // Redirigir a la lista de respuestas
        // NOTA: No llamar router.refresh() después de router.push() porque interfiere con la navegación
        router.push(getChecklistRedirectPath(pathname, equipmentId));
      }}
      deviations={deviations.map((d) => ({
        id: d.id,
        item_code: d.item_code,
        item_label: d.item_label,
        section_code: d.section_code,
        is_critical: d.is_critical ?? false,
        checklistAnswerId: d.checklist_answer_id,
        driver_comment: d.driver_comment,
        created_at: d.created_at?.toISOString() ?? new Date().toISOString(),
        // Unidad a la que se le imputa el desvío. Solo se muestra cuando hay
        // enganche declarado: sin él no hay ambigüedad que aclarar.
        equipment_label: selectedHitchEquipment
          ? hitchDeviationIds.has(d.id)
            ? hitchEquipmentLabel
            : utEquipmentLabel
          : null,
      }))}
      equipmentId={equipmentId}
      checklistAnswerId={checklistAnswerId}
      driverEmployeeId={driverEmployeeId}
    />
  );
}
