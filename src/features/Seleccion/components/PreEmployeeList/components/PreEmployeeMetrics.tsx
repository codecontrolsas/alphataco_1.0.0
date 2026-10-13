'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { MetricCard, type MetricTone } from '@/shared/components/common/MetricCard';
import type { getPreEmployeeStatusMetrics } from '../metrics.server';

type Metrics = Awaited<ReturnType<typeof getPreEmployeeStatusMetrics>>;

interface PreEmployeeMetricsProps {
  /** Mismo `tableId` que la tabla: de ahí sale el prefijo de sus params en la URL. */
  tableId: string;
  metrics: Metrics;
}

/** Una tarjeta por etapa del circuito. `pre_ingreso` es la que espera una decisión. */
const STAGES: { status: keyof Metrics; label: string; hint: string; tone: MetricTone }[] = [
  { status: 'en_proceso', label: 'En proceso', hint: 'Cargando datos y documentos', tone: 'default' },
  { status: 'pre_ingreso', label: 'Pre ingreso', hint: 'Esperan decisión', tone: 'brand' },
  { status: 'legajo', label: 'Legajo creado', hint: 'Ya son empleados', tone: 'ok' },
  { status: 'rechazado', label: 'Rechazados', hint: 'Se pueden reabrir', tone: 'default' },
];

/** Tarjetas del listado de candidatos. Cada una aplica su etapa como filtro de la tabla. */
export function PreEmployeeMetrics({ tableId, metrics }: PreEmployeeMetricsProps) {
  const [statusFilter, setStatusFilter] = useDataTableFilter(tableId, 'status');

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" role="group" aria-label="Candidatos por etapa">
      {STAGES.map((stage) => (
        <MetricCard
          key={stage.status}
          label={stage.label}
          value={metrics[stage.status] ?? 0}
          hint={stage.hint}
          tone={stage.tone}
          pressed={statusFilter === stage.status}
          onSelect={() => setStatusFilter(statusFilter === stage.status ? null : stage.status)}
        />
      ))}
    </div>
  );
}
