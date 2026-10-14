'use client';

import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/shared/hooks/useDebounce';

// ============================================
// TIPOS
// ============================================

export interface MultiSelectOption {
  id: string;
  name: string;
}

interface MultiSelectFieldProps {
  /** Etiqueta del campo */
  label: string;
  /** Placeholder del input de búsqueda */
  placeholder?: string;
  /** Función de búsqueda server-side */
  searchFn: (query: string) => Promise<MultiSelectOption[]>;
  /** Query key base para React Query */
  queryKey: string[];
  /** IDs seleccionados */
  selected: string[];
  /** Callback cuando cambian los seleccionados */
  onChange: (ids: string[]) => void;
  /** Campo deshabilitado */
  disabled?: boolean;
  /** Icono del campo */
  icon?: LucideIcon;
  /** Máximo de selecciones permitidas */
  maxSelections?: number;
  /** Mapa id→nombre para modo edición (hidratación inicial) */
  initialOptionsMap?: Map<string, string>;
}

// ============================================
// COMPONENTE
// ============================================

export function _MultiSelectField({
  label,
  placeholder = 'Buscar...',
  searchFn,
  queryKey,
  selected,
  onChange,
  disabled = false,
  icon: Icon,
  maxSelections,
  initialOptionsMap,
}: MultiSelectFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');
  const debouncedSearch = useDebounce(searchValue, 300);

  // Query para búsqueda — SOLO se ejecuta cuando el popover está abierto
  const { data: options = [], isLoading } = useQuery({
    queryKey: [...queryKey, debouncedSearch],
    queryFn: () => searchFn(debouncedSearch),
    enabled: open,
    staleTime: 30000, // 30 segundos
  });

  // Mapa de opciones seleccionadas para preservar nombres de items entre cambios de resultados.
  // Se inicializa con initialOptionsMap si se provee (modo edición).
  const [selectedOptionsMap, setSelectedOptionsMap] = React.useState<Map<string, string>>(
    () => new Map(initialOptionsMap ?? [])
  );

  // Actualizar mapa cuando llegan nuevas opciones del servidor
  React.useEffect(() => {
    if (options.length > 0) {
      setSelectedOptionsMap((prev) => {
        const newMap = new Map(prev);
        options.forEach((opt) => {
          newMap.set(opt.id, opt.name);
        });
        return newMap;
      });
    }
  }, [options]);

  // Toggle selección
  const handleToggle = (optionId: string, optionName: string) => {
    const isSelected = selected.includes(optionId);

    if (isSelected) {
      onChange(selected.filter((id) => id !== optionId));
    } else {
      if (maxSelections && selected.length >= maxSelections) {
        return;
      }
      onChange([...selected, optionId]);
      // Guardar nombre en el mapa para badges
      setSelectedOptionsMap((prev) => {
        const newMap = new Map(prev);
        newMap.set(optionId, optionName);
        return newMap;
      });
    }
  };

  // Remover selección desde badge
  const handleRemove = (optionId: string) => {
    onChange(selected.filter((id) => id !== optionId));
  };

  // Seleccionar todos los visibles (hasta maxSelections si aplica)
  const handleSelectAll = () => {
    const allIds = options.map((opt) => opt.id);
    const newSelected = [...new Set([...selected, ...allIds])];

    onChange(maxSelections ? newSelected.slice(0, maxSelections) : newSelected);

    // Registrar todos los nombres en el mapa
    setSelectedOptionsMap((prev) => {
      const newMap = new Map(prev);
      options.forEach((opt) => {
        newMap.set(opt.id, opt.name);
      });
      return newMap;
    });
  };

  // Limpiar todos los seleccionados
  const handleClearAll = () => {
    onChange([]);
  };

  const selectedCount = selected.length;
  const showSelectAll = options.length > 0 && options.length <= 10;
  const allVisibleSelected = options.length > 0 && options.every((opt) => selected.includes(opt.id));

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {label}
        {selectedCount > 0 && (
          <Badge variant="secondary" className="ml-1 text-xs">
            {selectedCount}
          </Badge>
        )}
      </Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            <span className="truncate text-muted-foreground">
              {selectedCount > 0 ? `${selectedCount} seleccionado${selectedCount > 1 ? 's' : ''}` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={placeholder} value={searchValue} onValueChange={setSearchValue} />

            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
                </div>
              ) : options.length === 0 ? (
                <CommandEmpty>{searchValue ? 'No se encontraron resultados' : 'Escribe para buscar...'}</CommandEmpty>
              ) : (
                <>
                  {/* Botones de acción: Seleccionar todo / Limpiar */}
                  {(showSelectAll || selectedCount > 0) && (
                    <>
                      <CommandGroup>
                        <div className="flex items-center justify-between px-2 py-1.5">
                          {showSelectAll && !allVisibleSelected && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSelectAll}>
                              Seleccionar todo
                            </Button>
                          )}
                          {selectedCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={handleClearAll}
                            >
                              Limpiar
                            </Button>
                          )}
                        </div>
                      </CommandGroup>
                      <CommandSeparator />
                    </>
                  )}

                  {/* Lista de opciones */}
                  <CommandGroup>
                    {options.map((option) => {
                      const isSelected = selected.includes(option.id);
                      return (
                        <CommandItem
                          key={option.id}
                          value={option.id}
                          onSelect={() => handleToggle(option.id, option.name)}
                        >
                          <div
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                              isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'
                            )}
                          >
                            <Check className="h-4 w-4" />
                          </div>
                          <span className="truncate">{option.name}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Badges de items seleccionados con botón de remoción individual */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => {
            const name = selectedOptionsMap.get(id) ?? id;
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-1">
                <span className="max-w-[150px] truncate">{name}</span>
                <button
                  type="button"
                  className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  onClick={() => handleRemove(id)}
                  disabled={disabled}
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  <span className="sr-only">Quitar {name}</span>
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
