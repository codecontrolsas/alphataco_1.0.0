'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock, Loader2, Lock, MousePointerClick, Search } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  closeServiceOrder,
  closeServiceOrderForVehicle,
  createServiceOrder,
} from '../actions/service-order-lifecycle.server';
import type { EnsuredTirePosition } from '../actions/service-order-queries.server';
import {
  getVehicleTypeInfo,
  searchCompatibleHitchVehicles,
  searchVehicleByDomain,
  type VehicleSearchResult,
} from '../actions/service-order-queries.server';
import { TireDiagram } from './TireDiagram';
import { TirePositionCard } from './TirePositionCard';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/ServiceOrderWizard');

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ServiceOrderWizardProps {
  vehicleId?: string;
  mode: 'qr' | 'dashboard';
  onClose: () => void;
  /** Resume an existing open order (skip setup, go straight to operation) */
  existingOrderId?: string;
  /** Pre-set trailer ID (for resuming orders with trailer) */
  trailerId?: string;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

type Step = 'setup' | 'operation';

interface WizardPermissions {
  /** Crear la orden: `ordenes_gomeria:create`. */
  canCreate: boolean;
  /** Operar y cerrar: `ordenes_gomeria:update`. */
  canOperate: boolean;
}

interface SelectedPosition {
  vehicleId: string;
  vehicleLabel: string;
  position: EnsuredTirePosition;
  positionLabel: string;
}

interface InterventionEntry {
  id: number;
  vehicleLabel: string;
  positionLabel: string;
  summary: string;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * El QR corre con el operario anónimo (claim de empleado, sin permisos de dashboard): ahí el
 * asistente no consulta permisos y se confía en las guardas de las actions. En el dashboard se
 * protege con las claves de `ordenes_gomeria` que exige el servidor.
 */
export function ServiceOrderWizard(props: ServiceOrderWizardProps) {
  if (props.mode === 'qr') {
    return <WizardBody {...props} permissions={{ canCreate: true, canOperate: true }} />;
  }
  return <DashboardWizard {...props} />;
}

function DashboardWizard(props: ServiceOrderWizardProps) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Cargando permisos">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <WizardBody
      {...props}
      permissions={{
        canCreate: hasPermission('mantenimiento', 'ordenes_gomeria', 'create'),
        canOperate: hasPermission('mantenimiento', 'ordenes_gomeria', 'update'),
      }}
    />
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

function WizardBody({
  vehicleId: presetVehicleId,
  mode,
  onClose,
  existingOrderId,
  trailerId: presetTrailerId,
  permissions,
}: ServiceOrderWizardProps & { permissions: WizardPermissions }) {
  const { canCreate, canOperate } = permissions;
  const isResuming = !!existingOrderId;
  const skipVehicleSearch = (mode === 'qr' && !!presetVehicleId) || isResuming;
  const [step, setStep] = useState<Step>(isResuming ? 'operation' : 'setup');

  // Vehicle & Trailer
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleSearchResult | null>(null);
  const [selectedTrailer, setSelectedTrailer] = useState<VehicleSearchResult | null>(null);
  const [hasTrailer, setHasTrailer] = useState(!!presetTrailerId);

  // Km
  const [kilometer, setKilometer] = useState('');

  // Active service order
  const [serviceOrderId, setServiceOrderId] = useState<string | null>(existingOrderId ?? null);

  // Panel de la posición abierta (uno solo por orden, en línea) y resumen de la sesión
  const [selected, setSelected] = useState<SelectedPosition | null>(null);
  const [interventions, setInterventions] = useState<InterventionEntry[]>([]);
  const [highlighted, setHighlighted] = useState<Record<string, number[]>>({});
  const diagramsRef = useRef<HTMLDivElement>(null);

  const activeVehicleId = presetVehicleId ?? selectedVehicle?.id ?? null;
  const trailerVehicleId = selectedTrailer?.id ?? presetTrailerId ?? null;
  const vehicleDomain = skipVehicleSearch ? '(vehículo escaneado)' : selectedVehicle?.domain ?? null;
  const tractorLabel = selectedVehicle?.domain ?? (skipVehicleSearch ? 'Vehículo escaneado' : 'Vehículo');
  const trailerLabel = selectedTrailer?.domain ?? 'Enganche';

  // Query vehicle type info to determine hitch eligibility
  const { data: vehicleTypeInfo } = useQuery({
    queryKey: ['vehicle-type-info', activeVehicleId],
    queryFn: () => getVehicleTypeInfo(activeVehicleId!),
    enabled: !!activeVehicleId,
    staleTime: 5 * 60 * 1000,
  });

  const canHaveHitch = vehicleTypeInfo?.is_tractor_unit === true && vehicleTypeInfo?.has_hitch === true;

  const handleVehicleSelect = useCallback((vehicle: VehicleSearchResult) => {
    setSelectedVehicle(vehicle);
    // Reset trailer when changing vehicle (compatibility may differ)
    setSelectedTrailer(null);
    setHasTrailer(false);
  }, []);

  const handleTrailerSelect = useCallback((vehicle: VehicleSearchResult) => {
    setSelectedTrailer(vehicle);
  }, []);

  // ─── Create order mutation ───────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => {
      if (!activeVehicleId) throw new Error('No se ha seleccionado un vehículo');
      // La empresa de la orden la deriva el servidor del vehículo, no viaja desde acá.
      return createServiceOrder({
        vehicle_id: activeVehicleId,
        trailer_vehicle_id: hasTrailer ? selectedTrailer?.id ?? null : null,
        kilometer: kilometer || null,
      });
    },
    onSuccess: (order) => {
      setServiceOrderId(order.id);
      setStep('operation');
    },
    onError: (error) => {
      logger.error('Error creating service order', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al crear la orden');
    },
  });

  // ─── Close order mutation ────────────────────────────────────────────────
  const closeMutation = useMutation({
    mutationFn: () => {
      if (!serviceOrderId) throw new Error('No hay orden activa');
      // El QR corre con el operario anónimo: ahí la orden se valida contra el equipo
      // escaneado, no contra la empresa activa (que esa sesión no tiene).
      if (mode === 'qr') {
        if (!activeVehicleId) throw new Error('No hay un equipo activo');
        return closeServiceOrderForVehicle(serviceOrderId, activeVehicleId);
      }
      return closeServiceOrder(serviceOrderId);
    },
    onSuccess: () => {
      toast.success('Orden finalizada correctamente');
      onClose();
    },
    onError: (error) => {
      logger.error('Error closing service order', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al finalizar la orden');
    },
  });

  // ─── Panel de posición ─────────────────────────────────────────────────────
  function handleSelectPosition(
    vehicleId: string,
    vehicleLabel: string,
    position: EnsuredTirePosition,
    positionLabel: string
  ) {
    setSelected({ vehicleId, vehicleLabel, position, positionLabel });
  }

  /** Cierra el panel y devuelve el foco al botón de la posición que lo abrió. */
  function handleClosePanel() {
    const current = selected;
    setSelected(null);
    if (!current) return;
    requestAnimationFrame(() => {
      diagramsRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-vehicle-id="${current.vehicleId}"] button[data-position="${current.position.position_number}"]`
        )
        ?.focus();
    });
  }

  function handleActionComplete(summary: string) {
    if (!selected) return;
    const { vehicleId, vehicleLabel, positionLabel, position } = selected;
    setInterventions((prev) => [...prev, { id: prev.length + 1, vehicleLabel, positionLabel, summary }]);
    setHighlighted((prev) => {
      const current = prev[vehicleId] ?? [];
      return current.includes(position.position_number)
        ? prev
        : { ...prev, [vehicleId]: [...current, position.position_number] };
    });
  }

  // ─── Can proceed to operation ──────────────────────────────────────────────
  const canProceed =
    canCreate &&
    !!activeVehicleId &&
    (skipVehicleSearch || !!selectedVehicle?.tire_template_id) &&
    (!hasTrailer || !!selectedTrailer?.tire_template_id);

  // ─── Step: Setup ───────────────────────────────────────────────────────────
  if (step === 'setup') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Nueva Orden de Gomería</DialogTitle>
          <DialogDescription>Busque un vehículo e ingrese los datos de la orden.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!canCreate && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
            >
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Su rol no permite crear órdenes de gomería. Requiere permiso de creación.
            </div>
          )}

          {/* Vehicle search */}
          {!skipVehicleSearch && (
            <VehicleSearchSection selectedVehicle={selectedVehicle} onSelect={handleVehicleSelect} />
          )}

          {skipVehicleSearch && (
            <div className="rounded-md bg-muted/40 border p-3 text-sm">
              <span className="text-muted-foreground text-xs">Vehículo: </span>
              <span className="font-semibold">(vehículo escaneado)</span>
            </div>
          )}

          <Separator />

          {/* Km */}
          <div className="space-y-1.5">
            <Label htmlFor="km">Kilómetros actuales</Label>
            <Input
              id="km"
              type="text"
              inputMode="numeric"
              placeholder="ej. 125000"
              value={kilometer}
              onChange={(e) => setKilometer(e.target.value)}
            />
          </div>

          {/* Trailer toggle — only for tractor units with hitch */}
          {canHaveHitch && (
            <>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p id="hitch-switch-label" className="text-sm font-medium">
                    Agregar Enganche
                  </p>
                  <p className="text-xs text-muted-foreground">El enganche también recibirá intervenciones</p>
                </div>
                <Switch aria-labelledby="hitch-switch-label" checked={hasTrailer} onCheckedChange={setHasTrailer} />
              </div>

              {/* Trailer search — filtered by compatible types */}
              {hasTrailer && activeVehicleId && (
                <TrailerSearchSection
                  tractorId={activeVehicleId}
                  selectedTrailer={selectedTrailer}
                  onSelect={handleTrailerSelect}
                />
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canProceed || createMutation.isPending}
            title={!canCreate ? 'Requiere permiso de creación' : undefined}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Iniciando...
              </>
            ) : (
              'Iniciar Operación'
            )}
          </Button>
        </DialogFooter>
      </>
    );
  }

  // ─── Step: Operation ───────────────────────────────────────────────────────
  const interventionCount = interventions.length;
  const interventionText = `${interventionCount} intervención${interventionCount !== 1 ? 'es' : ''}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Orden — {vehicleDomain ?? 'Vehículo'}</DialogTitle>
        <DialogDescription>
          Toque o seleccione con el teclado una posición del diagrama para registrar una intervención.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="yellow" className="gap-1">
            <Clock className="size-3" aria-hidden="true" />
            Orden abierta
          </Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
            <Check className="size-3.5 text-ok" aria-hidden="true" />
            {interventionText}
          </span>
        </div>

        {!canOperate && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
          >
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Solo lectura: registrar intervenciones y finalizar la orden requiere permiso de edición.
          </div>
        )}

        {/* Diagramas + panel de la posición (en línea: sin diálogos encadenados) */}
        <div className="@container">
          <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div ref={diagramsRef} className="min-w-0 space-y-4">
              {activeVehicleId && serviceOrderId && (
                <div data-vehicle-id={activeVehicleId}>
                  <TireDiagram
                    vehicleId={activeVehicleId}
                    cabinLabel={`Cabina · ${tractorLabel}`}
                    hitch={trailerVehicleId ? { label: 'Enganche', position: 'rear' } : undefined}
                    selectedPositionNumber={
                      selected?.vehicleId === activeVehicleId ? selected.position.position_number : null
                    }
                    highlightedPositions={highlighted[activeVehicleId] ?? []}
                    onSelectPosition={(pos, label) => handleSelectPosition(activeVehicleId, tractorLabel, pos, label)}
                  />
                </div>
              )}

              {trailerVehicleId && serviceOrderId && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-dashed" />
                    <p className="whitespace-nowrap text-xs text-muted-foreground">Enganche</p>
                    <div className="flex-1 border-t border-dashed" />
                  </div>
                  <div data-vehicle-id={trailerVehicleId}>
                    <TireDiagram
                      vehicleId={trailerVehicleId}
                      label={`Enganche ${selectedTrailer?.domain ?? ''}`.trim()}
                      hitch={{ label: 'Tractor', position: 'front' }}
                      selectedPositionNumber={
                        selected?.vehicleId === trailerVehicleId ? selected.position.position_number : null
                      }
                      highlightedPositions={highlighted[trailerVehicleId] ?? []}
                      onSelectPosition={(pos, label) =>
                        handleSelectPosition(trailerVehicleId, trailerLabel, pos, label)
                      }
                    />
                  </div>
                </>
              )}
            </div>

            <div className="min-w-0">
              {selected && serviceOrderId ? (
                <TirePositionCard
                  key={`${selected.vehicleId}-${selected.position.position_number}`}
                  position={selected.position}
                  serviceOrderId={serviceOrderId}
                  vehicleId={selected.vehicleId}
                  positionLabel={selected.positionLabel}
                  vehicleLabel={selected.vehicleLabel}
                  canOperate={canOperate}
                  onActionComplete={handleActionComplete}
                  onClose={handleClosePanel}
                />
              ) : (
                <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  <MousePointerClick className="size-5" aria-hidden="true" />
                  Seleccione una posición del diagrama para ver su cubierta y registrar calibración, reparación,
                  reemplazo o extravío.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resumen de intervenciones de la sesión */}
        <section aria-labelledby="order-interventions-title" className="space-y-2">
          <h3
            id="order-interventions-title"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Intervenciones de esta sesión ({interventionCount})
          </h3>
          {interventionCount === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se registró ninguna intervención en esta sesión.</p>
          ) : (
            <ol className="space-y-1">
              {interventions.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="font-medium">{entry.positionLabel}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {entry.vehicleLabel} · {entry.summary}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <DialogFooter className="sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-ok" aria-hidden="true" />
          {interventionText} en esta sesión
        </div>
        {canOperate && (
          <Button
            type="button"
            variant="brand"
            onClick={() => closeMutation.mutate()}
            disabled={closeMutation.isPending}
          >
            {closeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Finalizando...
              </>
            ) : (
              'Finalizar Orden'
            )}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// ─── Vehicle Search Section ──────────────────────────────────────────────────

interface VehicleSearchSectionProps {
  selectedVehicle: VehicleSearchResult | null;
  onSelect: (vehicle: VehicleSearchResult) => void;
}

/** Sólo se muestra en el dashboard: la empresa del buscador la resuelve la action por sesión. */
function VehicleSearchSection({ selectedVehicle, onSelect }: VehicleSearchSectionProps) {
  const [query, setQuery] = useState('');

  const {
    data: results = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['vehicle-search', query],
    queryFn: () => searchVehicleByDomain(query),
    enabled: query.trim().length >= 1,
    staleTime: 10 * 1000,
  });

  return (
    <div className="space-y-3">
      <Label htmlFor="vehicle-search">Buscar vehículo</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          id="vehicle-search"
          className="pl-8"
          placeholder="Buscar por dominio..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isFetching && <Skeleton className="h-10 w-full" />}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          No se pudo buscar vehículos. Intente de nuevo.
        </p>
      )}

      {!isFetching && !isError && query.trim().length > 0 && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">No se encontraron vehículos</p>
      )}

      {results.filter((v) => v.id !== selectedVehicle?.id).length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {results
            .filter((v) => v.id !== selectedVehicle?.id)
            .map((v) => (
              <VehicleRow key={v.id} vehicle={v} selected={false} onSelect={onSelect} />
            ))}
        </div>
      )}

      {selectedVehicle && (
        <div className="rounded-md border border-primary bg-primary/5 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{selectedVehicle.domain}</p>
              {selectedVehicle.intern_number && (
                <p className="text-xs text-muted-foreground">Int. {selectedVehicle.intern_number}</p>
              )}
              {selectedVehicle.sub_type_name && (
                <p className="text-xs text-muted-foreground">{selectedVehicle.sub_type_name}</p>
              )}
            </div>
            {!selectedVehicle.tire_template_id ? (
              <div className="flex items-center gap-1 text-destructive text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                Sin plantilla
              </div>
            ) : null}
          </div>
        </div>
      )}

      {selectedVehicle && !selectedVehicle.tire_template_id && (
        <p className="text-xs text-destructive">
          Este vehículo no tiene plantilla de cubiertas asignada y no puede ser utilizado para una orden de gomería.
        </p>
      )}
    </div>
  );
}

// ─── Trailer Search Section ──────────────────────────────────────────────────

interface TrailerSearchSectionProps {
  tractorId: string;
  selectedTrailer: VehicleSearchResult | null;
  onSelect: (vehicle: VehicleSearchResult) => void;
}

function TrailerSearchSection({ tractorId, selectedTrailer, onSelect }: TrailerSearchSectionProps) {
  const [query, setQuery] = useState('');

  const {
    data: results = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['compatible-hitch-search', tractorId, query],
    queryFn: () => searchCompatibleHitchVehicles(tractorId, query),
    enabled: query.trim().length >= 1,
    staleTime: 10 * 1000,
  });

  return (
    <div className="space-y-2 pl-3 border-l-2 border-muted">
      <Label htmlFor="trailer-search" className="text-xs">
        Buscar enganche por dominio
      </Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          id="trailer-search"
          className="pl-8"
          placeholder="Dominio del enganche..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isFetching && <Skeleton className="h-10 w-full" />}

      {isError && (
        <p role="alert" className="text-xs text-destructive">
          No se pudo buscar vehículos. Intente de nuevo.
        </p>
      )}

      {!isFetching && !isError && query.trim().length > 0 && results.length === 0 && (
        <p className="text-xs text-muted-foreground">No se encontraron vehículos</p>
      )}

      {results.filter((v) => v.id !== selectedTrailer?.id).length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {results
            .filter((v) => v.id !== selectedTrailer?.id)
            .map((v) => (
              <VehicleRow key={v.id} vehicle={v} selected={false} onSelect={onSelect} />
            ))}
        </div>
      )}

      {selectedTrailer && !selectedTrailer.tire_template_id && (
        <div className="flex items-center gap-1.5 text-destructive text-xs rounded-md border border-destructive/30 bg-destructive/5 p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          El enganche no tiene plantilla de cubiertas asignada
        </div>
      )}
    </div>
  );
}

// ─── Vehicle Row ─────────────────────────────────────────────────────────────

interface VehicleRowProps {
  vehicle: VehicleSearchResult;
  selected: boolean;
  onSelect: (vehicle: VehicleSearchResult) => void;
}

function VehicleRow({ vehicle, selected, onSelect }: VehicleRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(vehicle)}
      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${selected ? 'border-primary bg-primary/5' : ''}`}
    >
      <div>
        <p className="font-medium">{vehicle.domain}</p>
        {vehicle.intern_number && <p className="text-xs text-muted-foreground">Int. {vehicle.intern_number}</p>}
        {vehicle.sub_type_name && <p className="text-xs text-muted-foreground">{vehicle.sub_type_name}</p>}
      </div>
      <div className="flex items-center gap-2">
        {!vehicle.tire_template_id ? (
          <Badge variant="destructive" className="text-[10px]">
            Sin plantilla
          </Badge>
        ) : (
          <Badge variant="success" className="text-[10px]">
            Listo
          </Badge>
        )}
        {selected && <Check className="h-4 w-4 text-primary" />}
      </div>
    </button>
  );
}
