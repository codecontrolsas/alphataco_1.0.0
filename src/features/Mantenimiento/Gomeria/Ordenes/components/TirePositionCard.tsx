'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  tireRetreadLabels,
  tireStatusBadges,
  tireStatusLabels,
  tireTreadTypeLabels,
} from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { useTireReturnWarehouse } from '@/features/Mantenimiento/Gomeria/shared/hooks/useTireReturnWarehouse';
import { TireReturnWarehouseSelect } from '@/features/Mantenimiento/Gomeria/shared/TireReturnWarehouseSelect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AvailableTire, EnsuredTirePosition } from '../actions/actions.server';
import {
  performCalibration,
  performMissingReport,
  performRepair,
  performReplace,
} from '../actions/actions.server';
import { uploadDiscardPhoto } from '../utils/uploadDiscardPhoto';
import { TireReplacePicker } from './TireReplacePicker';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/TirePositionCard');

// ─── Props ───────────────────────────────────────────────────────────────────

interface TirePositionCardProps {
  position: EnsuredTirePosition;
  serviceOrderId: string;
  vehicleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete: () => void;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function TirePositionCard({
  position,
  serviceOrderId,
  vehicleId,
  open,
  onOpenChange,
  onActionComplete,
}: TirePositionCardProps) {
  const hasTire = position.tire_id !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Posición {position.position_number}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Tire info header */}
          {hasTire && position.tire ? (
            <TireInfoBadge tire={position.tire} />
          ) : (
            <div className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
              Posición vacía — primera asignación
            </div>
          )}

          {/* Actions */}
          {hasTire ? (
            <TireActionsWithTire
              position={position}
              serviceOrderId={serviceOrderId}
              vehicleId={vehicleId}
              onActionComplete={onActionComplete}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <EmptyPositionAssign
              position={position}
              serviceOrderId={serviceOrderId}
              vehicleId={vehicleId}
              onActionComplete={onActionComplete}
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Tire info header ─────────────────────────────────────────────────────────

interface TireInfo {
  serial_number: string;
  is_new: boolean;
  retread_level?: string | null;
  // Prisma returns Decimal which has a valueOf()/toString() similar to number
  tread_depth?: { valueOf(): number | string } | string | number | null;
  status: string;
  brand?: { name: string } | null;
  tire_type?: { size: string; tread_type: string } | null;
}

function TireInfoBadge({ tire }: { tire: TireInfo }) {
  const treadType = tire.tire_type?.tread_type;
  const treadLabel = treadType ? tireTreadTypeLabels[treadType] ?? treadType : '—';
  const retreadLabel = tire.retread_level ? tireRetreadLabels[tire.retread_level] : null;
  const statusLabel = tireStatusLabels[tire.status] ?? tire.status;
  const statusVariant = tireStatusBadges[tire.status] ?? 'default';

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-sm">{tire.serial_number}</span>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>
      <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
        <span>{tire.brand?.name ?? '—'}</span>
        <span>·</span>
        <span>{tire.tire_type?.size ?? '—'}</span>
        <span>·</span>
        <span>{treadLabel}</span>
        {tire.tread_depth != null && (
          <>
            <span>·</span>
            <span>{Number(tire.tread_depth).toFixed(0)} % desgaste</span>
          </>
        )}
      </div>
      <div className="flex gap-1">
        {tire.is_new ? (
          <Badge variant="success" className="text-[10px]">
            Nueva
          </Badge>
        ) : retreadLabel ? (
          <Badge variant="yellow" className="text-[10px]">
            {retreadLabel}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            Usada
          </Badge>
        )}
      </div>
    </div>
  );
}

// ─── Actions when tire is present ────────────────────────────────────────────

interface ActionProps {
  position: EnsuredTirePosition;
  serviceOrderId: string;
  vehicleId: string;
  onActionComplete: () => void;
  onClose: () => void;
}

function TireActionsWithTire({ position, serviceOrderId, vehicleId, onActionComplete, onClose }: ActionProps) {
  const queryClient = useQueryClient();

  function handleSuccess(message: string) {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ['vehicle-tire-positions', vehicleId] });
    // La que salio a disponible vuelve a ofrecerse; la que se monto deja de ofrecerse.
    void queryClient.invalidateQueries({ queryKey: ['available-tires', vehicleId] });
    onActionComplete();
    onClose();
  }

  // ─── Calibrate ──────────────────────────────────────────────────────────
  const [calibTread, setCalibTread] = useState('');
  const [calibPressStart, setCalibPressStart] = useState('');
  const [calibPressEnd, setCalibPressEnd] = useState('');
  const [calibObs, setCalibObs] = useState('');

  const calibMutation = useMutation({
    mutationFn: () =>
      performCalibration({
        serviceOrderId,
        positionNumber: position.position_number,
        vehicleId,
        tireId: position.tire_id!,
        treadDepth: calibTread ? Number(calibTread) : undefined,
        pressureStart: calibPressStart ? Number(calibPressStart) : undefined,
        pressureEnd: calibPressEnd ? Number(calibPressEnd) : undefined,
        observations: calibObs || undefined,
      }),
    onSuccess: () => handleSuccess('Calibración registrada'),
    onError: (error) => {
      logger.error('Error calibrating', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al calibrar');
    },
  });

  // ─── Repair ─────────────────────────────────────────────────────────────
  const [repairNewTire, setRepairNewTire] = useState<AvailableTire | null>(null);
  const [repairObs, setRepairObs] = useState('');

  const repairMutation = useMutation({
    mutationFn: async () => {
      if (!repairNewTire) throw new Error('Seleccione una cubierta de reemplazo');
      return unwrapAction(
        await performRepair({
          serviceOrderId,
          positionNumber: position.position_number,
          vehicleId,
          tireId: position.tire_id!,
          newTireId: repairNewTire.id,
          observations: repairObs || undefined,
        })
      );
    },
    onSuccess: () => handleSuccess('Reparación registrada'),
    onError: (error) => {
      logger.error('Error repairing', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al registrar reparación');
    },
  });

  // ─── Replace ────────────────────────────────────────────────────────────
  const [replaceNewTire, setReplaceNewTire] = useState<AvailableTire | null>(null);
  const [oldDest, setOldDest] = useState<'AVAILABLE' | 'DISCARD' | 'REPAIR'>('AVAILABLE');
  const [discardFile, setDiscardFile] = useState<File | null>(null);
  const [discardComment, setDiscardComment] = useState('');
  const [replaceTread, setReplaceTread] = useState('');
  const [replacePressStart, setReplacePressStart] = useState('');
  const [replacePressEnd, setReplacePressEnd] = useState('');
  const [replaceObs, setReplaceObs] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // La cubierta que sale a "Disponible" vuelve a un deposito si tiene stock (Almacenes etapa 6).
  const oldTireHasStock = !!position.tire?.material_unit_id;
  const returnWarehouse = useTireReturnWarehouse(vehicleId, oldTireHasStock);
  const effectiveWarehouseId = returnWarehouse.warehouseId;
  const needsWarehouse = oldDest === 'AVAILABLE' && oldTireHasStock;

  const replaceMutation = useMutation({
    mutationFn: async () => {
      if (!replaceNewTire) throw new Error('Seleccione una cubierta de reemplazo');
      if ((oldDest === 'DISCARD' || oldDest === 'REPAIR') && !discardComment) {
        throw new Error(`El motivo de ${oldDest === 'DISCARD' ? 'descarte' : 'reparación'} es obligatorio`);
      }

      let discardPhotoUrl: string | undefined;
      if ((oldDest === 'DISCARD' || oldDest === 'REPAIR') && discardFile) {
        setIsUploading(true);
        try {
          discardPhotoUrl = await uploadDiscardPhoto(discardFile, vehicleId);
        } finally {
          setIsUploading(false);
        }
      }

      return unwrapAction(
        await performReplace({
          serviceOrderId,
          positionNumber: position.position_number,
          vehicleId,
          tireId: position.tire_id!,
          newTireId: replaceNewTire.id,
          oldDestination: oldDest,
          oldTireWarehouseId: needsWarehouse ? effectiveWarehouseId || null : null,
          discardPhotoUrl,
          discardComment: oldDest === 'DISCARD' || oldDest === 'REPAIR' ? discardComment : undefined,
          treadDepth: replaceTread ? Number(replaceTread) : undefined,
          pressureStart: replacePressStart ? Number(replacePressStart) : undefined,
          pressureEnd: replacePressEnd ? Number(replacePressEnd) : undefined,
          observations: replaceObs || undefined,
        })
      );
    },
    onSuccess: () => handleSuccess('Reemplazo registrado'),
    onError: (error) => {
      logger.error('Error replacing', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al registrar reemplazo');
    },
  });

  // ─── Missing report ────────────────────────────────────────────────────
  const [missingObs, setMissingObs] = useState('');

  const missingMutation = useMutation({
    mutationFn: () =>
      performMissingReport({
        serviceOrderId,
        positionNumber: position.position_number,
        vehicleId,
        tireId: position.tire_id!,
        observations: missingObs || undefined,
      }),
    onSuccess: () => handleSuccess('Cubierta reportada como extraviada'),
    onError: (error) => {
      logger.error('Error reporting missing', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al reportar extravío');
    },
  });

  const isPending =
    calibMutation.isPending ||
    repairMutation.isPending ||
    replaceMutation.isPending ||
    missingMutation.isPending ||
    isUploading;

  return (
    <Tabs defaultValue="calibrate">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="calibrate">Calibrar</TabsTrigger>
        <TabsTrigger value="repair">Reparar</TabsTrigger>
        <TabsTrigger value="replace">Reemplazar</TabsTrigger>
        <TabsTrigger value="missing" className="text-destructive data-[state=active]:text-destructive">
          Extravío
        </TabsTrigger>
      </TabsList>

      {/* ─── Calibrate ─────────────────────────────────────────────────── */}
      <TabsContent value="calibrate" className="space-y-3 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Desgaste (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="ej. 75"
              value={calibTread}
              onChange={(e) => setCalibTread(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Presión inicio (PSI)</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder="ej. 80.0"
              value={calibPressStart}
              onChange={(e) => setCalibPressStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Presión fin (PSI)</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder="ej. 100.0"
              value={calibPressEnd}
              onChange={(e) => setCalibPressEnd(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Observaciones</Label>
          <Textarea
            placeholder="Observaciones opcionales..."
            rows={2}
            value={calibObs}
            onChange={(e) => setCalibObs(e.target.value)}
          />
        </div>
        <Button className="w-full" onClick={() => calibMutation.mutate()} disabled={isPending}>
          {calibMutation.isPending ? 'Registrando...' : 'Registrar calibración'}
        </Button>
      </TabsContent>

      {/* ─── Repair ────────────────────────────────────────────────────── */}
      <TabsContent value="repair" className="space-y-3 pt-2">
        <div>
          <Label className="text-xs mb-1 block">Cubierta de reemplazo</Label>
          <TireReplacePicker vehicleId={vehicleId} selectedTireId={repairNewTire?.id} onSelect={setRepairNewTire} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Observaciones</Label>
          <Textarea
            placeholder="Observaciones opcionales..."
            rows={2}
            value={repairObs}
            onChange={(e) => setRepairObs(e.target.value)}
          />
        </div>
        <Button className="w-full" onClick={() => repairMutation.mutate()} disabled={isPending || !repairNewTire}>
          {repairMutation.isPending ? 'Registrando...' : 'Registrar reparación'}
        </Button>
      </TabsContent>

      {/* ─── Replace ───────────────────────────────────────────────────── */}
      <TabsContent value="replace" className="space-y-3 pt-2">
        <div>
          <Label className="text-xs mb-1 block">Cubierta nueva</Label>
          <TireReplacePicker vehicleId={vehicleId} selectedTireId={replaceNewTire?.id} onSelect={setReplaceNewTire} />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Destino cubierta actual</Label>
          <RadioGroup
            value={oldDest}
            onValueChange={(v) => setOldDest(v as 'AVAILABLE' | 'DISCARD' | 'REPAIR')}
            className="flex gap-4 pt-1"
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="AVAILABLE" id="dest-avail" />
              <Label htmlFor="dest-avail" className="text-xs font-normal cursor-pointer">
                Disponible
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="DISCARD" id="dest-discard" />
              <Label htmlFor="dest-discard" className="text-xs font-normal cursor-pointer">
                Descarte
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="REPAIR" id="dest-repair" />
              <Label htmlFor="dest-repair" className="text-xs font-normal cursor-pointer">
                Reparación
              </Label>
            </div>
          </RadioGroup>
        </div>

        {needsWarehouse && returnWarehouse.needsChoice && (
          <TireReturnWarehouseSelect
            label="Depósito al que vuelve"
            warehouses={returnWarehouse.warehouses}
            value={effectiveWarehouseId}
            onChange={returnWarehouse.setWarehouseId}
          />
        )}

        {(oldDest === 'DISCARD' || oldDest === 'REPAIR') && (
          <div
            className={`space-y-2 rounded-md border p-3 ${
              oldDest === 'DISCARD'
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/20'
            }`}
          >
            <div className="space-y-1">
              <Label className="text-xs">Foto {oldDest === 'DISCARD' ? 'de descarte' : 'de reparación'}</Label>
              <Input type="file" accept="image/*" onChange={(e) => setDiscardFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Motivo {oldDest === 'DISCARD' ? 'de descarte' : 'de reparación'}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Motivo obligatorio..."
                rows={2}
                value={discardComment}
                onChange={(e) => setDiscardComment(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Desgaste nuevo (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="ej. 100"
              value={replaceTread}
              onChange={(e) => setReplaceTread(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Presión inicio (PSI)</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder="ej. 80.0"
              value={replacePressStart}
              onChange={(e) => setReplacePressStart(e.target.value)}
            />
          </div>
          <div className="space-y-1 col-start-2">
            <Label className="text-xs">Presión fin (PSI)</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder="ej. 100.0"
              value={replacePressEnd}
              onChange={(e) => setReplacePressEnd(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Observaciones</Label>
          <Textarea
            placeholder="Observaciones opcionales..."
            rows={2}
            value={replaceObs}
            onChange={(e) => setReplaceObs(e.target.value)}
          />
        </div>

        <Button
          className="w-full"
          onClick={() => replaceMutation.mutate()}
          disabled={
            isPending ||
            !replaceNewTire ||
            ((oldDest === 'DISCARD' || oldDest === 'REPAIR') && !discardComment) ||
            (needsWarehouse && !effectiveWarehouseId)
          }
        >
          {isUploading ? 'Subiendo foto...' : replaceMutation.isPending ? 'Registrando...' : 'Registrar reemplazo'}
        </Button>
      </TabsContent>

      {/* ─── Missing report ──────────────────────────────────────────── */}
      <TabsContent value="missing" className="space-y-3 pt-2">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          <p className="text-sm font-medium text-destructive">Reportar cubierta extraviada</p>
          <p className="text-xs text-muted-foreground">
            La cubierta será marcada como extraviada y la posición quedará vacía. Podrá asignar otra cubierta a
            continuación.
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">
            Observaciones <span className="text-destructive">*</span>
          </Label>
          <Textarea
            placeholder="Describa por qué se reporta como extraviada..."
            rows={3}
            value={missingObs}
            onChange={(e) => setMissingObs(e.target.value)}
          />
        </div>

        <Button
          variant="destructive"
          className="w-full"
          onClick={() => missingMutation.mutate()}
          disabled={isPending || !missingObs.trim()}
        >
          {missingMutation.isPending ? 'Reportando...' : 'Reportar extravío'}
        </Button>
      </TabsContent>
    </Tabs>
  );
}

// ─── Empty position (initial assign) ─────────────────────────────────────────

interface EmptyPositionAssignProps {
  position: EnsuredTirePosition;
  serviceOrderId: string;
  vehicleId: string;
  onActionComplete: () => void;
  onClose: () => void;
}

function EmptyPositionAssign({
  position,
  serviceOrderId,
  vehicleId,
  onActionComplete,
  onClose,
}: EmptyPositionAssignProps) {
  const queryClient = useQueryClient();
  const [selectedTire, setSelectedTire] = useState<AvailableTire | null>(null);

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTire) throw new Error('Seleccione una cubierta');
      return unwrapAction(
        await performReplace({
          serviceOrderId,
          positionNumber: position.position_number,
          vehicleId,
          tireId: null,
          newTireId: selectedTire.id,
        })
      );
    },
    onSuccess: () => {
      toast.success('Cubierta asignada a la posición');
      void queryClient.invalidateQueries({ queryKey: ['vehicle-tire-positions', vehicleId] });
      void queryClient.invalidateQueries({ queryKey: ['available-tires', vehicleId] });
      onActionComplete();
      onClose();
    },
    onError: (error) => {
      logger.error('Error assigning tire', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al asignar cubierta');
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Seleccione la cubierta a instalar en esta posición:
      </p>
      <TireReplacePicker vehicleId={vehicleId} selectedTireId={selectedTire?.id} onSelect={setSelectedTire} />
      <Button
        className="w-full"
        onClick={() => assignMutation.mutate()}
        disabled={!selectedTire || assignMutation.isPending}
      >
        {assignMutation.isPending ? 'Asignando...' : 'Asignar cubierta'}
      </Button>
    </div>
  );
}
