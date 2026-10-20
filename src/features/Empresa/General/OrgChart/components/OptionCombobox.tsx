'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { forwardRef, useState } from 'react';

export interface ComboOption {
  value: string;
  label: string;
}

interface OptionComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  /** Opción para dejar el campo vacío (ej. "Sin titular"); sin ella el campo es obligatorio. */
  noneLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Combo de selección simple con búsqueda (Popover + Command de shadcn), para los campos del cargo. */
export const OptionCombobox = forwardRef<HTMLButtonElement, OptionComboboxProps>(function OptionCombobox(
  { value, onChange, options, placeholder, searchPlaceholder, emptyText, noneLabel, loading, disabled, ...aria },
  ref
) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const shown = selected?.label ?? (value === null && noneLabel ? noneLabel : placeholder);

  const pick = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn('min-h-10 w-full justify-between font-normal', !selected && 'text-muted-foreground')}
          {...aria}
        >
          <span className="truncate">{loading ? 'Cargando…' : shown}</span>
          {loading ? (
            <Loader2 className="ml-2 size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {noneLabel ? (
                <CommandItem value={`__none__ ${noneLabel}`} onSelect={() => pick(null)}>
                  <Check className={cn('mr-2 size-4', value === null ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  {noneLabel}
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => pick(option.value)}>
                  <Check
                    className={cn('mr-2 size-4', value === option.value ? 'opacity-100' : 'opacity-0')}
                    aria-hidden="true"
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
