'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { useDataTablePending } from './DataTablePendingContext';

interface DataTableTextFilterProps {
  columnId: string;
  title: string;
  placeholder?: string;
  /** Namespace para prefijar los params de URL cuando hay múltiples DataTables en la misma página */
  paramNamespace?: string;
}

export function DataTableTextFilter({ columnId, title, placeholder, paramNamespace }: DataTableTextFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { startTransition, isClientSide, notifyUrlChange, urlVersion } = useDataTablePending();

  // Clave con prefijo de namespace si corresponde
  const paramKey = paramNamespace ? `${paramNamespace}__${columnId}` : columnId;
  const pageKey = paramNamespace ? `${paramNamespace}__page` : 'page';

  // Leer valor actual: desde browser URL en client-side mode, desde Next.js searchParams en server mode
  const currentValue = React.useMemo(() => {
    if (isClientSide && typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get(paramKey) ?? '';
    }
    return searchParams.get(paramKey) ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlVersion triggers re-read in client-side mode
  }, [isClientSide, searchParams, paramKey, urlVersion]);

  const [inputValue, setInputValue] = React.useState(currentValue);
  const hasValue = !!currentValue;

  // Sincronizar input si el valor cambia externamente
  React.useEffect(() => {
    setInputValue(currentValue);
  }, [currentValue]);

  const applyFilter = (value: string) => {
    // En client-side mode, leer params actuales del browser URL (no de Next.js state)
    const params = new URLSearchParams(isClientSide ? window.location.search : searchParams.toString());

    if (value.trim()) {
      params.set(paramKey, value.trim());
    } else {
      params.delete(paramKey);
    }
    params.set(pageKey, '1');

    if (isClientSide) {
      // Actualización silenciosa — no navega, no re-renderiza server components
      window.history.replaceState(window.history.state, '', `${pathname}?${params.toString()}`);
      notifyUrlChange();
    } else {
      // Comportamiento original: navegación del servidor
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    }
  };

  const clearFilter = () => {
    setInputValue('');
    applyFilter('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyFilter(inputValue);
    }
    if (e.key === 'Escape') {
      setInputValue(currentValue);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-9 border-dashed gap-1.5', hasValue && 'border-solid')}>
          <Search className="h-3.5 w-3.5" />
          {title}
          {hasValue && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal max-w-[120px] truncate">
                {currentValue}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Filtrar por {title.toLowerCase()}</p>
          <div className="flex gap-2">
            <Input
              placeholder={placeholder ?? `Buscar ${title.toLowerCase()}...`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-9 text-sm"
              autoFocus
            />
            <Button size="sm" className="h-9 shrink-0" onClick={() => applyFilter(inputValue)}>
              Aplicar
            </Button>
          </div>
          {hasValue && (
            <Button variant="ghost" size="sm" className="w-full h-7" onClick={clearFilter}>
              <X className="h-3.5 w-3.5 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
