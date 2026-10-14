'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  closeServiceOrder,
  closeServiceOrderForVehicle,
  createServiceOrder,
} from '../actions/service-order-lifecycle.server';
import {
  getVehicleTypeInfo,
  searchCompatibleHitchVehicles,
  searchVehicleByDomain,
  type VehicleSearchResult,
} from '../actions/service-order-queries.server';
import { TireDiagram } from './TireDiagram';

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

// ─── Component ───────────────────────────────────────────────────────────────

export function ServiceOrderWizard({
  vehicleId: presetVehicleId,
  mode,
  onClose,
  existingOrderId,
  trailerId: presetTrailerId,
}: ServiceOrderWizardProps) {
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

  // Intervention counter
  const [interventionCount, setInterventionCount] = useState(0);

  const activeVehicleId = presetVehicleId ?? selectedVehicle?.id ?? null;
  const vehicleDomain = skipVehicleSearch ? '(vehículo escaneado)' : selectedVehicle?.domain ?? null;

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

  // ─── Can proceed to operation ──────────────────────────────────────────────
  const canProceed =
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
                  <p className="text-sm font-medium">Agregar Enganche</p>
                  <p className="text-xs text-muted-foreground">El enganche también recibirá intervenciones</p>
                </div>
                <Switch checked={hasTrailer} onCheckedChange={setHasTrailer} />
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
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canProceed || createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
  return (
    <>
      <DialogHeader>
        <DialogTitle>Orden — {vehicleDomain ?? 'Vehículo'}</DialogTitle>
        <DialogDescription>Toque una posición para registrar una intervención.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="yellow">Orden abierta</Badge>
          {interventionCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-green-600" />
              {interventionCount} intervención{interventionCount !== 1 ? 'es' : ''}
            </span>
          )}
        </div>

        {/* Vehicle diagram */}
        {activeVehicleId && serviceOrderId && (
          <TireDiagram
            vehicleId={activeVehicleId}
            serviceOrderId={serviceOrderId}
            onInterventionDone={() => setInterventionCount((c) => c + 1)}
          />
        )}

        {/* Trailer diagram */}
        {(selectedTrailer?.id || presetTrailerId) && serviceOrderId && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 border-t border-dashed" />
              <p className="text-xs text-muted-foreground whitespace-nowrap">Enganche</p>
              <div className="flex-1 border-t border-dashed" />
            </div>
            <TireDiagram
              vehicleId={selectedTrailer?.id ?? presetTrailerId!}
              serviceOrderId={serviceOrderId}
              label="Enganche"
              onInterventionDone={() => setInterventionCount((c) => c + 1)}
            />
          </>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-green-600" />
          {interventionCount} intervención{interventionCount !== 1 ? 'es' : ''} en esta sesión
        </div>
        <Button variant="brand" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
          {closeMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Finalizando...
            </>
          ) : (
            'Finalizar Orden'
          )}
        </Button>
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

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['vehicle-search', query],
    queryFn: () => searchVehicleByDomain(query),
    enabled: query.trim().length >= 1,
    staleTime: 10 * 1000,
  });

  return (
    <div className="space-y-3">
      <Label>Buscar vehículo</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por dominio..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isFetching && <Skeleton className="h-10 w-full" />}

      {!isFetching && query.trim().length > 0 && results.length === 0 && (
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

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['compatible-hitch-search', tractorId, query],
    queryFn: () => searchCompatibleHitchVehicles(tractorId, query),
    enabled: query.trim().length >= 1,
    staleTime: 10 * 1000,
  });

  return (
    <div className="space-y-2 pl-3 border-l-2 border-muted">
      <Label className="text-xs">Buscar enganche por dominio</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Dominio del enganche..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isFetching && <Skeleton className="h-10 w-full" />}

      {!isFetching && query.trim().length > 0 && results.length === 0 && (
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
