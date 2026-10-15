'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { TireReturnWarehouseSelect } from '@/features/Mantenimiento/Gomeria/shared/TireReturnWarehouseSelect';
import { TireReplacePicker } from './TireReplacePicker';
import type { TirePositionActions } from './useTirePositionActions';

export function ReplaceTab({ actions, vehicleId }: { actions: TirePositionActions; vehicleId: string }) {
  const { replace, isPending, isUploading } = actions;
  const { oldDest, needsWarehouse, returnWarehouse, effectiveWarehouseId, discardComment } = replace;

  return (
    <TabsContent value="replace" className="space-y-3 pt-2">
      <div>
        <Label className="text-xs mb-1 block">Cubierta nueva</Label>
        <TireReplacePicker vehicleId={vehicleId} selectedTireId={replace.newTire?.id} onSelect={replace.setNewTire} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Destino cubierta actual</Label>
        <RadioGroup
          value={oldDest}
          onValueChange={(v) => replace.setOldDest(v as 'AVAILABLE' | 'DISCARD' | 'REPAIR')}
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
            oldDest === 'DISCARD' ? 'border-destructive/30 bg-destructive/5' : 'border-warn/30 bg-warn-subtle/50'
          }`}
        >
          <div className="space-y-1">
            <Label className="text-xs">Foto {oldDest === 'DISCARD' ? 'de descarte' : 'de reparación'}</Label>
            <Input type="file" accept="image/*" onChange={(e) => replace.setDiscardFile(e.target.files?.[0] ?? null)} />
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
              onChange={(e) => replace.setDiscardComment(e.target.value)}
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
            value={replace.tread}
            onChange={(e) => replace.setTread(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Presión inicio (PSI)</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            placeholder="ej. 80.0"
            value={replace.pressStart}
            onChange={(e) => replace.setPressStart(e.target.value)}
          />
        </div>
        <div className="space-y-1 col-start-2">
          <Label className="text-xs">Presión fin (PSI)</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            placeholder="ej. 100.0"
            value={replace.pressEnd}
            onChange={(e) => replace.setPressEnd(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Observaciones</Label>
        <Textarea
          placeholder="Observaciones opcionales..."
          rows={2}
          value={replace.obs}
          onChange={(e) => replace.setObs(e.target.value)}
        />
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={() => replace.mutation.mutate()}
        disabled={
          isPending ||
          !replace.newTire ||
          ((oldDest === 'DISCARD' || oldDest === 'REPAIR') && !discardComment) ||
          (needsWarehouse && !effectiveWarehouseId)
        }
      >
        {isUploading ? 'Subiendo foto...' : replace.mutation.isPending ? 'Registrando...' : 'Registrar reemplazo'}
      </Button>
    </TabsContent>
  );
}
