'use client';

import type { TireStatus } from '@/generated/prisma/enums';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { MetricCard, type MetricTone } from '@/shared/components/common/MetricCard';
import { useQuery } from '@tanstack/react-query';
import { getTireStatusCounts } from '../actions/tire-list.server';

type Counts = Awaited<ReturnType<typeof getTireStatusCounts>>;

/** Cuelga de `['tires-catalog']`: las mutaciones del catálogo ya invalidan ese prefijo y las tarjetas se refrescan solas. */
export const TIRE_STATUS_COUNTS_QUERY_KEY = ['tires-catalog', 'status-counts'] as const;

interface TireStatusMetricsProps {
  /** Namespace de params de la tabla (el prefijo `<namespace>__status` de su URL), no su `tableId` de preferencias. */
  paramNamespace: string;
  counts: Counts;
}

const CARDS: { status: TireStatus; label: string; hint: string; tone: MetricTone }[] = [
  { status: 'INSTALLED', label: 'Instaladas', hint: 'En vehículos', tone: 'default' },
  { status: 'AVAILABLE', label: 'Disponibles', hint: 'En depósitos', tone: 'ok' },
  { status: 'IN_REPAIR', label: 'En reparación', hint: 'Gomería o recapado', tone: 'warn' },
  { status: 'MISSING', label: 'Extraviadas', hint: 'Reportadas en órdenes', tone: 'danger' },
  { status: 'DISCARDED', label: 'Descartadas', hint: 'Fuera de uso', tone: 'default' },
];

/** Una tarjeta por estado de cubierta; cada una aplica su estado como filtro de la tabla. */
export function TireStatusMetrics({ paramNamespace, counts: initialCounts }: TireStatusMetricsProps) {
  const { data: counts = initialCounts } = useQuery({
    queryKey: TIRE_STATUS_COUNTS_QUERY_KEY,
    queryFn: () => getTireStatusCounts(),
    initialData: initialCounts,
    staleTime: 30_000,
  });
  const [statusFilter, setStatusFilter] = useDataTableFilter(paramNamespace, 'status');

  return (
    <div
      className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5"
      role="group"
      aria-label="Cubiertas por estado"
    >
      {CARDS.map((card) => (
        <MetricCard
          key={card.status}
          label={card.label}
          value={counts[card.status] ?? 0}
          hint={card.hint}
          tone={card.tone}
          pressed={statusFilter === card.status}
          onSelect={() => setStatusFilter(statusFilter === card.status ? null : card.status)}
        />
      ))}
    </div>
  );
}
