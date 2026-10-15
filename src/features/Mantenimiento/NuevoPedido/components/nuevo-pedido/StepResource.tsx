import type { MaintenanceResourceKind } from '@/features/Mantenimiento/shared/maintenance-resource';
import { Boxes, Truck } from 'lucide-react';
import { ResourceKindCard } from './SelectableCard';

interface StepResourceProps {
  isOtherEquipment: boolean;
  onChangeKind: (kind: MaintenanceResourceKind) => void;
}

/**
 * Paso "Recurso" (ticket 596): define si el pedido es para un equipo o para un equipamiento —
 * y con eso, qué lista el selector del paso siguiente.
 *
 * Las dos palabras son casi homógrafas y no se distinguen solas: cada opción lleva una línea
 * con ejemplos concretos, que es lo que hace elegible la tarjeta.
 */
export function StepResource({ isOtherEquipment, onChangeKind }: StepResourceProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 id="resource-kind-label" className="text-base font-medium text-balance">
          ¿Para qué es el pedido?
        </h3>
        <p className="text-sm text-muted-foreground text-pretty">
          Define qué equipos vas a poder elegir en el paso siguiente.
        </p>
      </div>

      <div role="radiogroup" aria-labelledby="resource-kind-label" className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        <ResourceKindCard
          kind="vehicle"
          icon={Truck}
          title="Equipos"
          description="Vehículos con dominio y kilometraje."
          selected={!isOtherEquipment}
          onSelect={onChangeKind}
        />
        <ResourceKindCard
          kind="other_equipment"
          icon={Boxes}
          title="Equipamientos"
          description="Contenedores, piletas, trailers. Sin dominio, se miden con horómetro."
          selected={isOtherEquipment}
          onSelect={onChangeKind}
        />
      </div>
    </div>
  );
}
