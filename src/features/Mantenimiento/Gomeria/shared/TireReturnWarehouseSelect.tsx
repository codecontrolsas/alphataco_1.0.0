'use client';

import { Label } from '@/components/ui/label';
import { useId } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TireReturnWarehouseSelectProps {
  warehouses: { id: string; name: string }[];
  value: string;
  onChange: (warehouseId: string) => void;
  label?: string;
}

/** Selector del depósito al que vuelven las cubiertas con stock (Almacenes etapa 6). */
export function TireReturnWarehouseSelect({
  warehouses,
  value,
  onChange,
  label = 'Depósito al que vuelven',
}: TireReturnWarehouseSelectProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label} <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Elegí el depósito" />
        </SelectTrigger>
        <SelectContent>
          {warehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
