'use client';

import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable/types';
import type { LucideIcon } from 'lucide-react';
import { Check, CircleOff, X } from 'lucide-react';
import { useCallback } from 'react';
import { documentListStateLabels, documentStateIcons } from '../shared/components/DocumentCells';
import type { DocumentListFacet } from './document-list-types';

/** Faceta de UNA columna: la server action de la lista (`columnId`, params de la URL, id del recurso embebido). */
export type SingleFacetAction = (
  columnId: string,
  searchParams: DataTableSearchParams,
  resourceId?: string
) => Promise<DocumentListFacet>;

/**
 * Builders de `fetchFacet` (carga lazy de opciones + counts al abrir cada filtro) compartidos por las
 * 4 tablas de documentos. `resourceId` es el empleado/equipo de la ficha cuando la lista va embebida.
 */
export function useDocumentListFacets(singleFacet: SingleFacetAction, resourceId?: string) {
  /** Enum con opciones fijas (estado, tipo de contrato...). */
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons?: Record<string, LucideIcon | undefined>
    ) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const { counts } = await singleFacet(columnId, params, resourceId);
        return {
          options: [
            ...enumValues.map((value) => ({
              value,
              label: labels[value] ?? value,
              ...(icons?.[value] ? { icon: icons[value] } : {}),
            })),
            ...(counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: 'Sin estado', icon: CircleOff }]
              : []),
          ],
          counts,
        };
      },
    [singleFacet, resourceId]
  );

  /** Estado del documento, con los mismos labels e íconos que la pill de la tabla. */
  const makeStateFetchFacet = useCallback(
    () =>
      makeEnumFetchFacet('state', Object.keys(documentListStateLabels), documentListStateLabels, documentStateIcons),
    [makeEnumFetchFacet]
  );

  /** FK / M:M: las opciones salen del servidor (sólo las que existen en el universo filtrado). */
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const { counts, resolvedOptions } = await singleFacet(columnId, params, resourceId);
        return {
          options: [
            ...(resolvedOptions?.map((option) => ({ value: option.id, label: option.name ?? '' })) ?? []),
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
          ],
          counts,
        };
      },
    [singleFacet, resourceId]
  );

  /** Booleano (mandatorio, multirecurso). */
  const makeBooleanFetchFacet = useCallback(
    (columnId: string, trueLabel: string, falseLabel: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const { counts } = await singleFacet(columnId, params, resourceId);
        return {
          options: [
            { value: 'true', label: trueLabel, icon: Check },
            { value: 'false', label: falseLabel, icon: X },
            ...(counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
              : []),
          ],
          counts,
        };
      },
    [singleFacet, resourceId]
  );

  return { makeEnumFetchFacet, makeStateFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet };
}
