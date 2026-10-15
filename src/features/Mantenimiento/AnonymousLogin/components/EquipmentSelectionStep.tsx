'use client';

import { Button } from '@/components/ui/button';
import { CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useEquipmentSearch } from '../hooks/useEquipmentSearch';
import { equipmentSelectionSchema, type EquipmentSelectionValues } from '../utils/login-schemas';

interface EquipmentSelectionStepProps {
  selectedEquipmentId: string | null;
  onSelect: (equipmentId: string) => void;
  onSubmit: (equipmentId: string) => void;
}

/**
 * Paso 1: identificar el equipo por dominio o serie cuando no llega por el QR.
 *
 * Búsqueda y resultados van en la misma pantalla (sin desplegable): en un celular el
 * teclado tapa el popover y el operario no ve qué está eligiendo.
 */
export function EquipmentSelectionStep({ selectedEquipmentId, onSelect, onSubmit }: EquipmentSelectionStepProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { options, isSearching, isTermTooShort } = useEquipmentSearch(searchTerm);

  const form = useForm<EquipmentSelectionValues>({
    resolver: zodResolver(equipmentSelectionSchema),
    defaultValues: { equipment_id: selectedEquipmentId || '' },
  });

  // El elegido puede no estar en la búsqueda actual (se retipeó): se conserva su etiqueta
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const currentValue = form.watch('equipment_id');

  // Un solo mensaje, siempre en el DOM: el lector de pantalla anuncia el resultado de cada búsqueda
  const statusMessage = isTermTooShort
    ? 'Ingrese al menos 2 caracteres para buscar'
    : isSearching
      ? 'Buscando…'
      : options.length === 0
        ? 'No se encontraron equipos. Probá con el número interno o la serie.'
        : `${options.length} ${options.length === 1 ? 'equipo encontrado' : 'equipos encontrados'}`;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit(values.equipment_id))} className="space-y-4">
        <CardDescription className="mb-4 text-center text-base text-foreground">
          Si el QR no se leyó, buscá el equipo por dominio o serie
        </CardDescription>
        <FormField
          control={form.control}
          name="equipment_id"
          render={() => (
            <FormItem>
              <FormLabel>Equipo</FormLabel>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <FormControl>
                  <Input
                    type="search"
                    inputMode="search"
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Dominio o serie"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="h-12 pl-9 text-base"
                  />
                </FormControl>
              </div>
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
                {isSearching && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
                {statusMessage}
              </p>

              {!isSearching && options.length > 0 && (
                <div
                  role="radiogroup"
                  aria-label="Equipos encontrados"
                  className="divide-y overflow-hidden rounded-lg border bg-card"
                >
                  {options.map((equipment) => {
                    const isSelected = equipment.id === currentValue;
                    return (
                      <button
                        key={equipment.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          form.setValue('equipment_id', equipment.id, { shouldValidate: true });
                          setSelectedLabel(equipment.label);
                          onSelect(equipment.id);
                        }}
                        className={cn(
                          'flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-base outline-none transition-colors',
                          'focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
                          isSelected ? 'bg-brand-subtle text-brand-subtle-foreground' : 'hover:bg-accent'
                        )}
                      >
                        <span className="min-w-0 truncate font-mono font-semibold">{equipment.label}</span>
                        <Check aria-hidden="true" className={cn('h-4 w-4 shrink-0', !isSelected && 'invisible')} />
                      </button>
                    );
                  })}
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="h-12 w-full text-base" disabled={form.formState.isSubmitting || !currentValue}>
          {selectedLabel && currentValue ? `Continuar con ${selectedLabel}` : 'Continuar'}
        </Button>
      </form>
    </Form>
  );
}
