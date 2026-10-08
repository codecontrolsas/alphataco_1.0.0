'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import moment from 'moment';
import type { MaterialAvailability } from '../../actions/options.server';
import { formatQuantity } from '../../lib/format';

/**
 * Piezas de seleccion de stock que comparten el formulario de movimientos y la entrega de
 * pedidos: los lotes con saldo (FEFO, vencidos deshabilitados) y las unidades serializadas.
 */

/** Opciones del Select de lotes. `allowExpired` solo en ajustes: es la forma de descartarlos. */
export function BatchOptions({
  batches,
  unit,
  allowExpired,
}: {
  batches: MaterialAvailability['batches'];
  unit: string;
  allowExpired: boolean;
}) {
  return batches.map((batch, i) => (
    <SelectItem key={batch.id} value={batch.id} disabled={batch.expired && !allowExpired}>
      <span className="tabular-nums">
        {batch.batchNumber} · {formatQuantity(batch.quantity)} {unit}
        {batch.expiresAt ? ` · vence ${moment(batch.expiresAt).format('DD/MM/YYYY')}` : ''}
        {batch.expired ? ' · Vencido' : i === 0 || batches[i - 1]?.expired ? ' · vence primero' : ''}
      </span>
    </SelectItem>
  ));
}

/** Grilla de unidades en stock para tildar. */
export function UnitPicker({
  units,
  value,
  onChange,
  idPrefix,
}: {
  units: MaterialAvailability['units'];
  value: string[];
  onChange: (unitIds: string[]) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2 lg:grid-cols-3">
      {units.map((unit) => {
        const checked = value.includes(unit.id);
        const id = `${idPrefix}-unit-${unit.id}`;
        return (
          <div key={unit.id} className={cn('flex items-center gap-2 rounded px-2 py-1', checked && 'bg-muted')}>
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(v) => onChange(v === true ? [...value, unit.id] : value.filter((u) => u !== unit.id))}
            />
            <Label htmlFor={id} className="cursor-pointer font-mono text-sm font-normal">
              {unit.serial_number}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
