import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  getResourceInternNumber,
  getResourceKind,
  getResourceKindLabel,
  getResourceLabel,
} from '@/features/Mantenimiento/shared/maintenance-resource';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { OrderManagementItem } from '../../actions/queries.server';

/**
 * Datos del recurso del pedido (vehículo o equipamiento, ticket 596): el encabezado tiene que
 * identificar bien a cualquiera de los dos.
 */
export function WizardResourceHeader({ order }: { order: OrderManagementItem }) {
  const resource = { vehicles: order.vehicles ?? null, other_equipment: order.other_equipment ?? null };
  const isOtherEquipment = getResourceKind(resource) === 'other_equipment';
  const resourceInternNumber = getResourceInternNumber(resource);
  const resourceTypeName = order.other_equipment?.type?.name ?? order.vehicles?.vehicle_type?.name ?? null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg text-sm flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold">{getResourceLabel(resource)}</span>
        {resourceInternNumber && <span className="text-muted-foreground">({resourceInternNumber})</span>}
        <Badge variant="secondary" className="text-[10px] font-normal">
          {getResourceKindLabel(resource)}
        </Badge>
      </div>
      <Separator orientation="vertical" className="h-4" />
      <span className="text-muted-foreground">{resourceTypeName || 'Sin tipo'}</span>
      <Separator orientation="vertical" className="h-4" />
      <span className="text-muted-foreground">
        Ingreso:{' '}
        <span className="text-foreground font-medium">
          {order.workshop_entry_date ? formatArgentinaDay(order.workshop_entry_date) : '-'}
        </span>
      </span>
      {/* Un equipamiento no acumula kilometraje: solo se mide por horometro */}
      {!isOtherEquipment && (
        <>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-muted-foreground">
            Km: <span className="text-foreground font-medium">{order.vehicles?.kilometer || '-'}</span>
          </span>
        </>
      )}
      <Separator orientation="vertical" className="h-4" />
      <span className="text-muted-foreground">
        Hs:{' '}
        <span className="text-foreground font-medium">
          {(isOtherEquipment ? order.other_equipment?.horometer : order.vehicles?.engine_hours) || '-'}
        </span>
      </span>
    </div>
  );
}
