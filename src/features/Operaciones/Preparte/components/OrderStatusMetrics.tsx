'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { MetricCard, type MetricTone } from '@/shared/components/common/MetricCard';
import { PREPARTE_TABLE_ID } from '../constants';

export type OrderMetricStatus = 'pendiente' | 'confirmado' | 'reprogramado' | 'rechazado' | 'vencido';
export type OrderStatusCounts = Record<OrderMetricStatus, number>;

/** Valor que se muestra cuando no se pudo contar (la tarjeta sigue funcionando como filtro). */
const UNKNOWN_COUNT = '—';

const STATES: { status: OrderMetricStatus; label: string; hint: string; tone: MetricTone }[] = [
  { status: 'pendiente', label: 'Pendientes', hint: 'Esperan confirmación', tone: 'warn' },
  { status: 'confirmado', label: 'Confirmados', hint: 'Listos para ejecutar', tone: 'ok' },
  { status: 'reprogramado', label: 'Reprogramados', hint: 'Cambiaron de fecha', tone: 'brand' },
  { status: 'rechazado', label: 'Rechazados', hint: 'No se pueden cubrir', tone: 'danger' },
  { status: 'vencido', label: 'Vencidos', hint: 'Pasó la fecha sin ejecutar', tone: 'warn' },
];

/** Tarjetas de pedidos por estado. Cada una aplica su estado como filtro de la columna `status`; tocar la activa la limpia. */
export function OrderStatusMetrics({
  counts,
  serverStatus = null,
}: {
  /** `null` cuando falló el conteo: cada tarjeta muestra "—". */
  counts: OrderStatusCounts | null;
  /** Estado filtrado con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverStatus?: string | null;
}) {
  const [statusFilter, setStatusFilter] = useDataTableFilter(PREPARTE_TABLE_ID, 'status', serverStatus);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5" role="group" aria-label="Pedidos por estado">
      {STATES.map((item) => (
        <MetricCard
          key={item.status}
          label={item.label}
          value={counts ? (counts[item.status] ?? 0) : UNKNOWN_COUNT}
          hint={item.hint}
          tone={item.tone}
          pressed={statusFilter === item.status}
          onSelect={() => setStatusFilter(statusFilter === item.status ? null : item.status)}
        />
      ))}
    </div>
  );
}
