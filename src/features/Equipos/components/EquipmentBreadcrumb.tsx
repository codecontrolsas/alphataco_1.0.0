import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface EquipmentBreadcrumbProps {
  kind: 'vehicle' | 'other';
  isActive: boolean;
  /** Identificador visible del equipo (dominio, serie o interno). */
  identifier: string | null | undefined;
}

/** Ruta de vuelta desde la ficha de un equipo a la lista (activos o dados de baja) de la que viene. */
export function EquipmentBreadcrumb({ kind, isActive, identifier }: EquipmentBreadcrumbProps) {
  const listHref = isActive
    ? `/dashboard/equipment?tab=${kind === 'vehicle' ? 'vehicles' : 'others'}`
    : `/dashboard/equipment?tab=inactive&inactive_subtab=${kind === 'vehicle' ? 'inactive_vehicles' : 'inactive_others'}`;
  const listLabel = kind === 'vehicle' ? 'Vehículos' : 'Equipamiento';

  return (
    <nav aria-label="Ruta" className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
      <Link
        href={listHref}
        className="hover:text-foreground focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
      >
        {listLabel} · {isActive ? 'Activos' : 'Dados de baja'}
      </Link>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
      <span aria-current="page" className="text-foreground min-w-0 truncate font-mono tabular-nums">
        {identifier || 'Sin identificador'}
      </span>
    </nav>
  );
}
