import type { ChartConfig } from '@/components/ui/chart';
import { categoricalColorVar, statusColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';

/**
 * Única configuración de series de "Gestión de pedidos" (línea de tiempo y barras por cliente).
 *
 * Los colores salen de las variables `--dash-*` de `ChartColorVars` (con variante oscura por tema), que
 * se montan en el contenedor `data-dashboard-colors` de la pestaña. Semántica: verde = confirmado,
 * ámbar = pendiente, rojo = cancelado, azul-violeta = rechazado, gris = otros. Diferencia perceptual
 * (CIEDE2000, visión normal) entre todos los pares: 25,2 en claro y 20,2 en oscuro (piso 15).
 * La identidad no depende sólo del color: leyenda y tooltip nombran cada serie.
 */
export const ORDER_SERIES = ['confirmado', 'pendiente', 'rechazado', 'cancelado', 'otros'] as const;

export type OrderSeriesKey = (typeof ORDER_SERIES)[number];

export type OrderActiveView = 'total' | 'confirmado' | 'pendiente' | 'rechazado' | 'cancelado';

export const ORDER_CHART_CONFIG = {
  confirmado: { label: 'Confirmados', color: statusColorVar('operational') },
  pendiente: { label: 'Pendientes', color: statusColorVar('available') },
  rechazado: { label: 'Rechazados', color: categoricalColorVar(5) },
  cancelado: { label: 'Cancelados', color: statusColorVar('unavailable') },
  otros: { label: 'Otros', color: 'var(--dash-neutral)' },
} satisfies ChartConfig;
