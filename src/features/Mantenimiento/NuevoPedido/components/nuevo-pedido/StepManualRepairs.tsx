import { Badge } from '@/components/ui/badge';
import {
  ManualRepairsInput,
  type ManualRepair,
  type ManualRepairDraftState,
  type ManualRepairsInputHandle,
} from '@/features/Mantenimiento/shared/components/ManualRepairsInput';
import type { Dispatch, Ref, SetStateAction } from 'react';

interface StepManualRepairsProps {
  repairs: ManualRepair[];
  onChange: Dispatch<SetStateAction<ManualRepair[]>>;
  inputRef: Ref<ManualRepairsInputHandle>;
  onDraftStateChange: (state: ManualRepairDraftState) => void;
  disabled: boolean;
}

/**
 * Paso de items para la carga manual: se cargan las reparaciones directamente,
 * escribiéndolas a mano, con fotos opcionales.
 */
export function StepManualRepairs({
  repairs,
  onChange,
  inputRef,
  onDraftStateChange,
  disabled,
}: StepManualRepairsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {/* Encabezado de sección: no es un <Label> porque no rotula ningún control */}
        <h3 className="text-sm leading-none font-medium">Cargá las reparaciones que necesita el equipo</h3>
        <Badge variant="secondary" className="shrink-0">
          <span className="tabular-nums">{repairs.length}</span> {repairs.length === 1 ? 'reparación' : 'reparaciones'}
        </Badge>
      </div>

      <ManualRepairsInput
        repairs={repairs}
        onChange={onChange}
        ref={inputRef}
        onDraftStateChange={onDraftStateChange}
        disabled={disabled}
        // La carga manual es siempre a mano, para equipos y equipamientos por igual:
        // no se elige ni grupo de reparaciones ni tarea del listado. El taller asigna
        // el tipo que corresponda al procesar el pedido.
        freeTextOnly
      />
    </div>
  );
}
