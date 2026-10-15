import { cn } from '@/lib/utils';
import {
  getResourceInternNumber,
  getResourceKind,
  getResourceLabel,
  type WithMaintenanceResource,
} from '../maintenance-resource';

export interface ResourceCellResource {
  kind: 'vehicle' | 'equipment';
  identifier: string;
  internNumber?: string | null;
  /** Subtipo del recurso (tipo de vehículo o de equipamiento). */
  subtitle?: string | null;
}

interface ResourceCellProps {
  resource: ResourceCellResource;
}

/** Arma el recurso de la celda desde una fila con `vehicles` / `other_equipment` (ver `maintenance-resource`). */
export function toResourceCellResource(row: WithMaintenanceResource, subtitle?: string | null): ResourceCellResource {
  return {
    kind: getResourceKind(row) === 'other_equipment' ? 'equipment' : 'vehicle',
    identifier: getResourceLabel(row),
    internNumber: getResourceInternNumber(row),
    subtitle,
  };
}

/**
 * Identificador del recurso: el vehículo como una patente (borde sólido) y el equipamiento con borde
 * punteado, para distinguirlos aun mezclados en una misma tabla. Abajo, "N° interno · subtipo".
 */
export function ResourceCell({ resource }: ResourceCellProps) {
  const detail = [resource.internNumber ? `N° ${resource.internNumber}` : null, resource.subtitle]
    .filter((part): part is string => !!part)
    .join(' · ');

  return (
    <div className="min-w-0">
      <span
        className={cn(
          'bg-card inline-block max-w-full truncate rounded border-[1.5px] px-1.5 font-mono text-sm leading-normal font-semibold tracking-wide',
          resource.kind === 'vehicle'
            ? 'border-foreground'
            : 'border-muted-foreground text-muted-foreground border-dashed'
        )}
        title={resource.kind === 'vehicle' ? 'Vehículo' : 'Equipamiento'}
      >
        <span className="sr-only">{resource.kind === 'vehicle' ? 'Vehículo' : 'Equipamiento'}: </span>
        {resource.identifier}
      </span>
      {detail ? (
        <span className="text-muted-foreground mt-0.5 block truncate text-[13px] leading-tight" title={detail}>
          {detail}
        </span>
      ) : null}
    </div>
  );
}
