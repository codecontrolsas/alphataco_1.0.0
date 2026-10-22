import type { FacetResult } from '@/shared/components/common/DataTable/types';
import { Check, X } from 'lucide-react';

/**
 * Armado de `FacetResult` para los filtros de las listas de documentos de empresa (módulo sin
 * directiva: lo usan los componentes cliente de DocumentosEmpresa y de Empresa/General/Documentacion).
 */

/** Booleano: Sí/No con iconos + counts. */
export function buildBooleanFacetResult(counts: Map<string, number>, trueLabel = 'Sí', falseLabel = 'No'): FacetResult {
  return {
    options: [
      { value: 'true', label: trueLabel, icon: Check },
      { value: 'false', label: falseLabel, icon: X },
    ],
    counts,
  };
}
