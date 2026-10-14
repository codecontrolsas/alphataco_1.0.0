'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { MetricCard, type MetricTone } from '@/shared/components/common/MetricCard';

export type DocumentStateCounts = Partial<
  Record<'aprobado' | 'presentado' | 'pendiente' | 'vencido' | 'rechazado', number>
>;

interface DocumentStateMetricsProps {
  /** Mismo `tableId` que la tabla: de ahí sale el prefijo de sus params en la URL. */
  tableId: string;
  counts: DocumentStateCounts;
}

/** Una tarjeta por estado. Las que piden acción se tiñen; "Presentado" es el término que ya usa el sistema. */
const STATES: { state: keyof DocumentStateCounts; label: string; hint: string; tone: MetricTone }[] = [
  { state: 'aprobado', label: 'Aprobados', hint: 'Vigentes y validados', tone: 'ok' },
  { state: 'presentado', label: 'Presentados', hint: 'Esperan aprobación', tone: 'brand' },
  { state: 'pendiente', label: 'Faltantes', hint: 'Sin cargar', tone: 'default' },
  { state: 'vencido', label: 'Vencidos', hint: 'Hay que renovarlos', tone: 'warn' },
  { state: 'rechazado', label: 'Rechazados', hint: 'Hay que volver a subirlos', tone: 'danger' },
];

/** Tarjetas de un listado de documentos. Cada una aplica su estado como filtro de la columna `state`. */
export function DocumentStateMetrics({ tableId, counts }: DocumentStateMetricsProps) {
  const [stateFilter, setStateFilter] = useDataTableFilter(tableId, 'state');

  return (
    <div
      className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
      role="group"
      aria-label="Documentos por estado"
    >
      {STATES.map((item) => (
        <MetricCard
          key={item.state}
          label={item.label}
          value={counts[item.state] ?? 0}
          hint={item.hint}
          tone={item.tone}
          pressed={stateFilter === item.state}
          onSelect={() => setStateFilter(stateFilter === item.state ? null : item.state)}
        />
      ))}
    </div>
  );
}
