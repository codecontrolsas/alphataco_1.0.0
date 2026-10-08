'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { useDeferredValue, useState, type ReactNode } from 'react';

export interface SearchOption {
  id: string;
  label: string;
}

interface SearchComboboxProps<T extends SearchOption> {
  /** Clave base de React Query; se le agrega la busqueda. */
  queryKey: readonly unknown[];
  search: (query: string) => Promise<{ items: T[]; total: number }>;
  value: string;
  /** Label de lo elegido (la opcion puede no estar en la pagina de resultados actual). */
  selectedLabel: string | null;
  onSelect: (option: T | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  /** Sustantivo plural para el aviso: "Mostrando 30 de 412 materiales". */
  noun: string;
  disabled?: boolean;
  renderOption?: (option: T) => ReactNode;
  id?: string;
}

/**
 * Combobox con busqueda en el SERVIDOR y tope de resultados (no trae el catalogo entero).
 *
 * El aviso "Mostrando X de Y" va ARRIBA de la lista, fuera del area que scrollea, y la region
 * `role="status"` existe siempre en el DOM: si se montara y desmontara, el lector de pantalla
 * no anunciaria el cambio (lecciones del CLAUDE.md sobre avisos dentro de listas con max-h).
 */
export function SearchCombobox<T extends SearchOption>({
  queryKey,
  search,
  value,
  selectedLabel,
  onSelect,
  placeholder,
  searchPlaceholder,
  noun,
  disabled,
  renderOption,
  id,
}: SearchComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const { data, isFetching, isError } = useQuery({
    queryKey: [...queryKey, deferredQuery],
    queryFn: () => search(deferredQuery),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const status = isError
    ? 'No se pudo cargar la lista'
    : isFetching && !data
      ? 'Buscando…'
      : total > items.length
        ? `Mostrando ${items.length} de ${total} ${noun}. Escribí para acotar.`
        : total === 1
          ? '1 resultado'
          : `${total} ${noun}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex gap-1">
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value ? (selectedLabel ?? 'Seleccionado') : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {value && !disabled && (
          <Button type="button" variant="ghost" size="icon" aria-label="Quitar selección" onClick={() => onSelect(null)}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <p role="status" aria-live="polite" className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
            {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
            {status}
          </p>
          <CommandList>
            <CommandEmpty>{isFetching ? 'Buscando…' : `No se encontraron ${noun}`}</CommandEmpty>
            <CommandGroup>
              {items.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  onSelect={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === option.id ? 'opacity-100' : 'opacity-0')} />
                  {renderOption ? renderOption(option) : option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
