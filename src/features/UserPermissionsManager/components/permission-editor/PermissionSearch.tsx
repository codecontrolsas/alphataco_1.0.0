'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Search, X } from 'lucide-react';
import { useId } from 'react';

interface PermissionSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Vistas que coinciden en todos los módulos (null = sin búsqueda) */
  resultCount: number | null;
  onlyGranted: boolean;
  onOnlyGrantedChange: (value: boolean) => void;
  onlyGrantedLabel: string;
}

/** Buscador por módulo, vista o acción (también en sus descripciones) y filtro "solo con acceso". */
export function PermissionSearch({
  query,
  onQueryChange,
  resultCount,
  onlyGranted,
  onOnlyGrantedChange,
  onlyGrantedLabel,
}: PermissionSearchProps) {
  const switchId = useId();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Ej.: aprobar, importes, facturación"
            aria-label="Buscar permisos por módulo, vista o acción"
            className="h-10 pr-9 pl-9"
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onQueryChange('')}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-0.5 size-9 -translate-y-1/2"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex min-h-10 items-center gap-2">
          <Switch id={switchId} checked={onlyGranted} onCheckedChange={onOnlyGrantedChange} />
          <Label htmlFor={switchId} className="text-sm font-normal">
            {onlyGrantedLabel}
          </Label>
        </div>
      </div>
      {/* Siempre montado para que el lector de pantalla anuncie el cambio */}
      <p role="status" aria-live="polite" className="text-muted-foreground min-h-4 text-xs tabular-nums">
        {resultCount === null
          ? ''
          : resultCount === 0
            ? 'Ninguna vista coincide con la búsqueda'
            : `${resultCount} ${resultCount === 1 ? 'vista coincide' : 'vistas coinciden'} con la búsqueda`}
      </p>
    </div>
  );
}
