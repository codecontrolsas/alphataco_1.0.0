'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { MetricCard, type MetricTone } from '@/shared/components/common/MetricCard';
import type { getOtherEquipmentConditionMetrics } from '../metrics.server';

type Metrics = Awaited<ReturnType<typeof getOtherEquipmentConditionMetrics>>;

interface OtherEquipmentMetricsProps {
  /** Mismo `tableId` que la tabla: de ahí sale el prefijo de sus params en la URL. */
  tableId: string;
  metrics: Metrics;
}

/** Una tarjeta por condición operativa. Las que piden atención se tiñen. */
const CONDITIONS: { condition: keyof Metrics; label: string; hint: string; tone: MetricTone }[] = [
  { condition: 'operativo', label: 'Operativos', hint: 'Listos para trabajar', tone: 'ok' },
  { condition: 'operativo_condicionado', label: 'Condicionados', hint: 'Operan con restricciones', tone: 'warn' },
  { condition: 'en_reparacion', label: 'En reparación', hint: 'En taller', tone: 'default' },
  { condition: 'no_operativo', label: 'No operativos', hint: 'Fuera de servicio', tone: 'danger' },
];

/** Tarjetas del listado de equipamiento. Cada una aplica su condición como filtro de la tabla. */
export function OtherEquipmentMetrics({ tableId, metrics }: OtherEquipmentMetricsProps) {
  const [conditionFilter, setConditionFilter] = useDataTableFilter(tableId, 'condition');

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" role="group" aria-label="Equipamiento por condición">
      {CONDITIONS.map((item) => (
        <MetricCard
          key={item.condition}
          label={item.label}
          value={metrics[item.condition] ?? 0}
          hint={item.hint}
          tone={item.tone}
          pressed={conditionFilter === item.condition}
          onSelect={() => setConditionFilter(conditionFilter === item.condition ? null : item.condition)}
        />
      ))}
    </div>
  );
}
