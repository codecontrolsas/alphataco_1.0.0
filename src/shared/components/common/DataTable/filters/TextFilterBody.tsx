'use client';

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { UrlTextFilterState } from './use-url-text-filter';

interface TextFilterBodyProps {
  title: string;
  placeholder?: string;
  state: UrlTextFilterState;
  /** Enfoca el input al montar (popover). En el acordeón mobile va en `false`. */
  autoFocus?: boolean;
  /** Clases extra del input (en mobile: 16px y 44px de alto para evitar el zoom de iOS). */
  inputClassName?: string;
}

/** Cuerpo del filtro de texto (input + "Aplicar" + "Limpiar"). Reusable en popover y acordeón mobile. */
export function TextFilterBody({ title, placeholder, state, autoFocus = true, inputClassName }: TextFilterBodyProps) {
  const { inputValue, setInputValue, hasValue, applyFilter, clearFilter, handleKeyDown } = state;

  return (
    <div className="space-y-2">
      <p className="text-caption font-medium text-muted-foreground">Filtrar por {title.toLowerCase()}</p>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder ?? `Buscar ${title.toLowerCase()}...`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={`Filtrar por ${title.toLowerCase()}`}
          className={cn('h-8 text-sm', inputClassName)}
          autoFocus={autoFocus}
        />
        <Button type="button" size="sm" className="h-8 shrink-0" onClick={() => applyFilter(inputValue)}>
          Aplicar
        </Button>
      </div>
      {hasValue && (
        <Button type="button" variant="ghost" size="sm" className="w-full h-7" onClick={clearFilter}>
          <X className="h-3.5 w-3.5 mr-1" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
