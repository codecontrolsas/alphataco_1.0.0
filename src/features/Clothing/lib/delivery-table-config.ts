import { deliveryStatusLabels } from '@/features/Clothing/lib/delivery-stock-where';
import { clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import { clothing_delivery_type } from '@/generated/prisma/enums';
import { enumFilterOptions } from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import moment from 'moment';

/**
 * Configuración de cliente que repiten las tablas de entregas de ropa (historial del empleado, todas las
 * entregas y reporte global): opciones del filtro de tipo, filtro de firma y formateadores de exportación.
 */

/** Opciones del filtro "Tipo de entrega". */
export const deliveryTypeOptions = enumFilterOptions(Object.values(clothing_delivery_type), clothingDeliveryTypeLabels);

/** Filtro "Firma" con los conteos de las filas ya cargadas (no consulta al servidor). */
export function signatureFilterFromRows(
  rows: ReadonlyArray<{ signature_url: string | null }>
): DataTableFacetedFilterConfig {
  return {
    columnId: 'has_signature',
    title: 'Firma',
    fetchFacet: async () => {
      const trueCount = rows.filter((d) => d.signature_url != null).length;
      const falseCount = rows.filter((d) => d.signature_url == null).length;
      const counts = new Map<string, number>();
      if (trueCount > 0) counts.set('true', trueCount);
      if (falseCount > 0) counts.set('false', falseCount);
      return {
        options: [
          { value: 'true', label: 'Con firma' },
          { value: 'false', label: 'Sin firma' },
        ],
        counts,
      };
    },
  };
}

/** Formateador de exportación de un legajo: el valor o un guion. */
export const formatFileForExport = (val: unknown) => (val != null ? String(val) : '-');

/** Formateadores de exportación de las columnas que comparten las tres tablas. */
export const DELIVERY_EXPORT_FORMATTERS = {
  delivered_at: (val: unknown) => (val ? moment(val as Date).format('DD/MM/YYYY') : '-'),
  delivery_type: (val: unknown) =>
    val ? clothingDeliveryTypeLabels[val as keyof typeof clothingDeliveryTypeLabels] ?? String(val) : '-',
  has_signature: (val: unknown) => (val === 'true' ? 'Sí' : 'No'),
  status: (val: unknown) => deliveryStatusLabels[String(val)] ?? '-',
};
