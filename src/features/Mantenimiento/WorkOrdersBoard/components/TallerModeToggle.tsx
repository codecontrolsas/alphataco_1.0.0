'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Columns3, List } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type TallerMode = 'lista' | 'tablero';

/**
 * Selector Lista / Tablero de Gestión → Taller. El modo vive en `?modo=tablero` (Lista = sin el parámetro) y el cambio
 * conserva el resto de la URL (`tab`, `vista`, `taller_step`…). Es server-driven: `router.replace` re-renderiza la vista.
 */
export function TallerModeToggle({ mode }: { mode: TallerMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (next: string) => {
    // Radix devuelve '' al des-seleccionar el activo: se ignora (siempre hay un modo).
    if ((next !== 'lista' && next !== 'tablero') || next === mode) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'tablero') params.set('modo', 'tablero');
    else params.delete('modo');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={mode}
      onValueChange={handleChange}
      aria-label="Modo de visualización de Taller"
    >
      <ToggleGroupItem value="lista" aria-label="Lista: pestañas por paso">
        <List className="size-4" aria-hidden="true" />
        Lista
      </ToggleGroupItem>
      <ToggleGroupItem value="tablero" aria-label="Tablero: columnas por estado">
        <Columns3 className="size-4" aria-hidden="true" />
        Tablero
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
