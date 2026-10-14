'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TabsContent } from '@/components/ui/tabs';
import type { TirePositionActions } from './useTirePositionActions';
import { TireReplacePicker } from './TireReplacePicker';

interface TabProps {
  actions: TirePositionActions;
  vehicleId: string;
}

export function CalibrateTab({ actions }: Pick<TabProps, 'actions'>) {
  const { calibration, isPending } = actions;
  return (
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
            value={calibration.tread}
            onChange={(e) => calibration.setTread(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Presión inicio (PSI)</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            placeholder="ej. 80.0"
            value={calibration.pressStart}
            onChange={(e) => calibration.setPressStart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Presión fin (PSI)</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            placeholder="ej. 100.0"
            value={calibration.pressEnd}
            onChange={(e) => calibration.setPressEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Observaciones</Label>
        <Textarea
          placeholder="Observaciones opcionales..."
          rows={2}
          value={calibration.obs}
          onChange={(e) => calibration.setObs(e.target.value)}
        />
      </div>
      <Button type="button" className="w-full" onClick={() => calibration.mutation.mutate()} disabled={isPending}>
        {calibration.mutation.isPending ? 'Registrando...' : 'Registrar calibración'}
      </Button>
    </TabsContent>
  );
}

export function RepairTab({ actions, vehicleId }: TabProps) {
  const { repair, isPending } = actions;
  return (
    <TabsContent value="repair" className="space-y-3 pt-2">
      <div>
        <Label className="text-xs mb-1 block">Cubierta de reemplazo</Label>
        <TireReplacePicker vehicleId={vehicleId} selectedTireId={repair.newTire?.id} onSelect={repair.setNewTire} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Observaciones</Label>
        <Textarea
          placeholder="Observaciones opcionales..."
          rows={2}
          value={repair.obs}
          onChange={(e) => repair.setObs(e.target.value)}
        />
      </div>
      <Button
        type="button"
        className="w-full"
        onClick={() => repair.mutation.mutate()}
        disabled={isPending || !repair.newTire}
      >
        {repair.mutation.isPending ? 'Registrando...' : 'Registrar reparación'}
      </Button>
    </TabsContent>
  );
}

export function MissingTab({ actions }: Pick<TabProps, 'actions'>) {
  const { missing, isPending } = actions;
  return (
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
          value={missing.obs}
          onChange={(e) => missing.setObs(e.target.value)}
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        className="w-full"
        onClick={() => missing.mutation.mutate()}
        disabled={isPending || !missing.obs.trim()}
      >
        {missing.mutation.isPending ? 'Reportando...' : 'Reportar extravío'}
      </Button>
    </TabsContent>
  );
}
