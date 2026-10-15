'use client';

import type {
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
  FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { dailyReportRowStatusLabels, dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import {
  AlertTriangle,
  CalendarOff,
  CheckCircle2,
  CircleOff,
  Clock,
  ShieldCheck,
  Truck,
  User,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { getCertificationSingleFacet } from '../actions/queries.server';

/** Iconos del estado de la línea: los mismos en el filtro y en el badge de la celda. */
export const certificationStatusIcons: Record<string, LucideIcon> = {
  pendiente: Clock,
  sin_recursos_asignados: AlertTriangle,
  ejecutado: CheckCircle2,
  reprogramado: CalendarOff,
  cancelado: XCircle,
  en_certificacion: ShieldCheck,
};

interface FetchFacetOptions {
  /** Etiquetas de un enum: las opciones salen de sus claves (todas, aunque no tengan registros). */
  labels?: Record<string, string>;
  /** Iconos por valor de un enum. */
  icons?: Record<string, LucideIcon>;
  /** Un mismo icono para todas las opciones (columnas de recurso: empleado, equipo). */
  optionIcon?: LucideIcon;
  /** Etiqueta de la opción "sin valor" (solo aparece si hay registros nulos). */
  nullLabel?: string;
}

/**
 * Filtros facetados de la tabla (lazy-load: las opciones y los conteos se piden al abrir cada filtro,
 * con cross-filter en el servidor) y la lista de sus ids. Las opciones salen de:
 * - FK / texto: `resolvedOptions` del servidor;
 * - enum: `labels` (y `icons`).
 */
export function useCertificationFacets() {
  const makeFetchFacet = useCallback(
    (columnId: string, { labels, icons, optionIcon, nullLabel = 'Sin asignar' }: FetchFacetOptions = {}) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCertificationSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };

        const base = labels
          ? Object.keys(labels).map((value) => ({
              value,
              label: labels[value] ?? value,
              ...(icons?.[value] ? { icon: icons[value] } : {}),
            }))
          : ('resolvedOptions' in result ? (result.resolvedOptions ?? []) : []).map((option) => ({
              value: option.value,
              label: option.label,
              ...(optionIcon ? { icon: optionIcon } : {}),
            }));

        const options = [
          ...base,
          ...(result.counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
        ];
        return { options, counts: result.counts };
      };
    },
    []
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'date', title: 'Fecha del parte', type: 'dateRange' as const },
      { columnId: 'customer', title: 'Cliente', fetchFacet: makeFetchFacet('customer', { nullLabel: 'Sin cliente' }) },
      { columnId: 'service', title: 'Servicio', fetchFacet: makeFetchFacet('service', { nullLabel: 'Sin servicio' }) },
      { columnId: 'item', title: 'Ítem', fetchFacet: makeFetchFacet('item', { nullLabel: 'Sin ítem' }) },
      { columnId: 'item_description', title: 'Descripción del ítem', type: 'text' as const, placeholder: 'Buscar en la descripción del ítem...' },
      {
        columnId: 'customer_equipment',
        title: 'Equipo del cliente',
        fetchFacet: makeFetchFacet('customer_equipment', { nullLabel: 'Sin equipo del cliente' }),
      },
      { columnId: 'area', title: 'Área', fetchFacet: makeFetchFacet('area', { nullLabel: 'Sin área' }) },
      { columnId: 'sector', title: 'Sector', fetchFacet: makeFetchFacet('sector', { nullLabel: 'Sin sector' }) },
      {
        columnId: 'type_service',
        title: 'Tipo de servicio',
        fetchFacet: makeFetchFacet('type_service', { labels: dailyReportTypeServiceLabels, nullLabel: 'Sin tipo' }),
      },
      { columnId: 'remit_number', title: 'N° de remito', type: 'text' as const, placeholder: 'Buscar remito...' },
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeFetchFacet('status', { labels: dailyReportRowStatusLabels, icons: certificationStatusIcons }),
      },
      {
        columnId: 'employees',
        title: 'Empleados',
        fetchFacet: makeFetchFacet('employees', { nullLabel: 'Sin empleados', optionIcon: User }),
      },
      {
        columnId: 'equipment',
        title: 'Equipo de la empresa',
        fetchFacet: makeFetchFacet('equipment', { nullLabel: 'Sin equipos', optionIcon: Truck }),
      },
      { columnId: 'working_day', title: 'Jornada', fetchFacet: makeFetchFacet('working_day', { nullLabel: 'Sin jornada' }) },
      { columnId: 'description', title: 'Descripción', type: 'text' as const, placeholder: 'Buscar en la descripción...' },
    ],
    [makeFetchFacet]
  );

  /** Ids de todos los filtros, derivados de la configuración (no una lista aparte que se desincronice). */
  const allFilterIds = useMemo(() => facetedFilters.map((filter) => filter.columnId), [facetedFilters]);

  return { facetedFilters, allFilterIds };
}
