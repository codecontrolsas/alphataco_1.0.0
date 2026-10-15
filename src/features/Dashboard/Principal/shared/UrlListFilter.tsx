'use client';

import { Button } from '@/components/ui/button';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Filter } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

interface UrlListFilterProps {
  /** Parámetro de la URL donde vive el filtro (ids separados por coma). */
  paramName: string;
  options: { label: string; value: string }[];
  placeholder: string;
  /** Valores que la página leyó de la URL. */
  initialValues: string[];
}

/**
 * Filtro de varias opciones guardado en la URL (`?<paramName>=a,b`): se puede compartir, sobrevive
 * al recargar y no pisa al resto de los parámetros (tablero activo, tablas). Al confirmar se vuelve
 * a pedir la página al servidor con el filtro nuevo.
 */
export function UrlListFilter({ paramName, options, placeholder, initialValues }: UrlListFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedValues, setSelectedValues] = useState<string[]>(initialValues);

  const handleApply = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedValues.length > 0) params.set(paramName, selectedValues.join(','));
    else params.delete(paramName);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
      <div className="w-full min-w-0 sm:w-[280px]">
        <MultiSelectCombobox
          options={options}
          placeholder={placeholder}
          emptyMessage="Sin resultados"
          selectedValues={selectedValues}
          onChange={setSelectedValues}
          showSelectAll
        />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={handleApply}>
        <Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Filtrar
      </Button>
    </div>
  );
}
