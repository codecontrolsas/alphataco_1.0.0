'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { getMaintenanceCategoryVehicles } from '../actions/actions.server';
import type { MaintenanceTypeOption, OwnershipCategory, VehicleStatus } from '../types';
import { EquipmentRow } from './EquipmentRow';
import { PatenteSearchInput } from './PatenteSearchInput';

interface CategorySectionProps {
  category: OwnershipCategory;
  monthKey: string;
  totalCount: number;
  types: MaintenanceTypeOption[];
  selectedTypeIds: string[];
  onTypeFilterChange: (values: string[]) => void;
  patenteFilter: string;
  onPatenteFilterChange: (value: string) => void;
  selectedStatuses: Set<VehicleStatus>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  daysElapsed: number;
  highlightActive: boolean;
  highlightSeq: number;
}

/**
 * Skeleton de una fila — replica fielmente el layout de EquipmentRow
 * (borde lateral + icono + info + chip de estado + barra + count) para que
 * el loading se sienta como contenido inminente y no como vacio generico.
 */
function EquipmentRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b last:border-b-0 border-l-4 border-l-muted">
      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="hidden @2xl:block h-7 w-[140px] shrink-0 rounded-full" />
      <Skeleton className="@2xl:hidden h-7 w-7 shrink-0 rounded-full" />
      <Skeleton className="hidden @xl:block h-2 w-[180px] shrink-0 rounded-full" />
      <div className="text-right shrink-0 w-[88px] space-y-1">
        <Skeleton className="h-4 w-14 ml-auto" />
        <Skeleton className="h-2.5 w-8 ml-auto" />
      </div>
    </div>
  );
}

export function CategorySection({
  category,
  monthKey,
  totalCount,
  types,
  selectedTypeIds,
  onTypeFilterChange,
  patenteFilter,
  onPatenteFilterChange,
  selectedStatuses,
  open,
  onOpenChange,
  daysElapsed,
  highlightActive,
  highlightSeq,
}: CategorySectionProps) {
  // Lazy fetch: solo dispara la query cuando el acordeon esta abierto.
  // Cachea por monthKey+category — reabrir es instantaneo dentro del staleTime.
  const {
    data: vehicles,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['mantenimiento-vehicles', monthKey, category],
    queryFn: () => getMaintenanceCategoryVehicles(monthKey, category),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Combinacion AND de filtros locales (tipos + patente) + globales (estados).
  const filteredVehicles = React.useMemo(() => {
    if (!vehicles) return [];
    const patenteQuery = patenteFilter.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (selectedTypeIds.length > 0) {
        if (v.typeId === null || !selectedTypeIds.includes(v.typeId)) return false;
      }
      if (selectedStatuses.size > 0 && !selectedStatuses.has(v.status)) return false;
      if (patenteQuery.length > 0) {
        if (!v.domain?.toLowerCase().includes(patenteQuery)) return false;
      }
      return true;
    });
  }, [vehicles, selectedTypeIds, selectedStatuses, patenteFilter]);

  // Equipos UNICOS "en el taller" dentro del filtro actual: criterio = estado
  // no_operativo Y con solicitudes/procesos de mantenimiento abiertos. Cuenta
  // filas-vehiculo (1 por dominio), nunca registros de solicitudes (ticket 233).
  const inMaintenanceCount = React.useMemo(
    () => filteredVehicles.filter((v) => v.status === 'no_operativo' && v.workflows.total > 0).length,
    [filteredVehicles]
  );

  // Workdays del acordeon: suma de dias trabajados / posibles (cap a daysElapsed).
  const workdays = React.useMemo(() => {
    if (filteredVehicles.length === 0) return { worked: 0, possible: 0 };
    const worked = filteredVehicles.reduce((sum, v) => sum + Math.min(v.workedDays, daysElapsed), 0);
    const possible = filteredVehicles.length * daysElapsed;
    return { worked, possible };
  }, [filteredVehicles, daysElapsed]);

  // Highlight ring: se activa por 800ms cuando este acordeon recibe drill-down.
  // useEffect minimal — unico caso justificado: cleanup de timer asociado a un
  // evento externo (highlightSeq) que no podemos derivar.
  const [showRing, setShowRing] = React.useState(false);
  React.useEffect(() => {
    if (!highlightActive) return;
    setShowRing(true);
    const t = window.setTimeout(() => setShowRing(false), 800);
    return () => window.clearTimeout(t);
  }, [highlightActive, highlightSeq]);

  const hasLocalFilter = selectedTypeIds.length > 0 || patenteFilter.trim().length > 0 || selectedStatuses.size > 0;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} asChild>
      <Card
        className={cn('@container py-0 transition-shadow duration-300', showRing && 'ring-2 ring-primary/50 shadow-md')}
      >
        <CardHeader className="flex flex-col gap-3 px-6 py-3 border-b @3xl:flex-row @3xl:items-center @3xl:justify-between">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 gap-2 px-2 hover:bg-transparent group justify-start"
              aria-label={`${open ? 'Contraer' : 'Expandir'} ${category}`}
            >
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
              />
              <span className="text-base font-semibold">{category}</span>
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {open && vehicles
                  ? hasLocalFilter
                    ? `${filteredVehicles.length} / ${vehicles.length}`
                    : vehicles.length
                  : totalCount}
              </Badge>
              {open && vehicles && inMaintenanceCount > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 tabular-nums border-[var(--dash-warn)] text-foreground"
                  title="Equipos únicos en mantenimiento"
                >
                  {inMaintenanceCount} en mant.
                </Badge>
              )}
              {open && vehicles && daysElapsed > 0 && filteredVehicles.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground hidden @3xl:inline tabular-nums">
                  {workdays.worked.toLocaleString('es-AR')}
                  <span className="text-muted-foreground/60"> / </span>
                  {workdays.possible.toLocaleString('es-AR')} días
                </span>
              )}
            </Button>
          </CollapsibleTrigger>

          <div
            className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <PatenteSearchInput
              value={patenteFilter}
              onChange={onPatenteFilterChange}
              disabled={!open}
              className="@xl:w-[160px]"
            />
            <div className="@xl:w-[200px]">
              <MultiSelectCombobox
                options={types.map((t) => ({ label: t.name, value: t.id }))}
                placeholder={types.length === 0 ? 'Sin tipos' : 'Todos los tipos'}
                emptyMessage="No hay tipos disponibles"
                selectedValues={selectedTypeIds}
                onChange={onTypeFilterChange}
                disabled={types.length === 0 || !open}
                showSelectAll
              />
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-0">
            {isError ? (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p>No se pudieron cargar los equipos.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                  Reintentar
                </Button>
              </div>
            ) : isLoading || !vehicles ? (
              <>
                {Array.from({ length: Math.max(3, Math.min(totalCount, 5)) }).map((_, i) => (
                  <EquipmentRowSkeleton key={i} />
                ))}
              </>
            ) : vehicles.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">No hay equipos en esta categoría.</p>
            ) : filteredVehicles.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Ningún equipo coincide con los filtros aplicados.
              </p>
            ) : (
              filteredVehicles.map((vehicle) => (
                <EquipmentRow key={vehicle.id} vehicle={vehicle} daysElapsed={daysElapsed} />
              ))
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
