'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import type { OperatorRepairType } from '../actions/tasks.server';

interface RepairTypeComboboxProps {
  id?: string;
  repairTypes: OperatorRepairType[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  hasError?: boolean;
  disabled?: boolean;
}

/**
 * Selector de tipo de reparacion con buscador integrado.
 * Reemplaza al <Select> plano para poder filtrar la lista escribiendo,
 * en lugar de navegar manualmente hasta encontrar la tarea.
 */
export function RepairTypeCombobox({
  id,
  repairTypes,
  value,
  onValueChange,
  placeholder = 'Seleccionar tipo de reparacion',
  hasError = false,
  disabled = false,
}: RepairTypeComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = repairTypes.find((rt) => rt.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-11 w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            hasError && 'border-destructive ring-destructive/20 ring-2'
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <span className="truncate">{selected.name}</span>
                {selected.autorizable && (
                  <Badge variant="warning" className="shrink-0 px-1.5 py-0 text-xs">
                    Autorizable
                  </Badge>
                )}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Buscar tipo de reparacion..." className="h-9" />
          <CommandList>
            <CommandEmpty>No se encontraron tipos de reparacion.</CommandEmpty>
            <CommandGroup>
              {repairTypes.map((rt) => (
                <CommandItem
                  key={rt.id}
                  value={rt.name}
                  onSelect={() => {
                    onValueChange(rt.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === rt.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex items-center gap-2">
                    {rt.name}
                    {rt.autorizable && (
                      <Badge variant="warning" className="px-1.5 py-0 text-xs">
                        Autorizable
                      </Badge>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
