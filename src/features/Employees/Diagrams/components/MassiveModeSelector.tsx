'use client';

import { FormItem, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { CalendarRange, Sparkles } from 'lucide-react';

export type MassiveMode = 'diagram' | 'novelty';

/** Selector del tipo de carga masiva: diagrama cíclico o una novedad para todo el rango. */
export function MassiveModeSelector({
  value,
  onChange,
}: {
  value: MassiveMode;
  onChange: (mode: MassiveMode) => void;
}) {
  return (
    <FormItem>
      <label className="text-sm font-medium leading-none">Tipo de carga</label>
      <RadioGroup
        value={value}
        onValueChange={(val) => onChange(val as MassiveMode)}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <label
          htmlFor="mode-diagram"
          className={cn(
            'relative flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-colors',
            'hover:bg-accent/40',
            value === 'diagram' ? 'border-primary bg-primary/5' : 'border-muted'
          )}
        >
          <RadioGroupItem value="diagram" id="mode-diagram" className="mt-1" />
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" />
              <span className="font-medium">Diagrama</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Aplica un patrón cíclico (activos/inactivos) a los empleados durante el rango.
            </span>
          </div>
        </label>
        <label
          htmlFor="mode-novelty"
          className={cn(
            'relative flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-colors',
            'hover:bg-accent/40',
            value === 'novelty' ? 'border-primary bg-primary/5' : 'border-muted'
          )}
        >
          <RadioGroupItem value="novelty" id="mode-novelty" className="mt-1" />
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">Novedad</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Asigna la misma novedad a todos los días del rango (ej: feriado, licencia).
            </span>
          </div>
        </label>
      </RadioGroup>
      <FormMessage />
    </FormItem>
  );
}
