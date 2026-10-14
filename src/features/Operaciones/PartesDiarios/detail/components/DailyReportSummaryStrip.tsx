'use client';

import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { getDailyReportRowStatusSummary, type DailyReportRowStatusSummary } from '../queries.server';

interface Props {
  dailyReportId: string;
  initialData: DailyReportRowStatusSummary;
}

/**
 * Franja de datos clave del parte. La query cuelga de `['daily-report-detail', id]`, el mismo prefijo
 * que invalida la tabla al crear, editar, clonar o borrar registros: los números se actualizan solos.
 */
export function DailyReportSummaryStrip({ dailyReportId, initialData }: Props) {
  const { data = initialData } = useQuery({
    queryKey: ['daily-report-detail', dailyReportId, 'summary'],
    queryFn: () => getDailyReportRowStatusSummary(dailyReportId),
    initialData,
  });

  const facts = [
    { label: 'Registros', value: data.total, attention: '' },
    { label: 'Ejecutados', value: data.byStatus.ejecutado ?? 0, attention: '' },
    { label: 'Pendientes', value: data.byStatus.pendiente ?? 0, attention: 'text-warn-subtle-foreground' },
    {
      label: 'Sin recursos',
      value: data.byStatus.sin_recursos_asignados ?? 0,
      attention: 'text-danger-subtle-foreground',
    },
  ];

  return (
    <dl className="bg-card grid grid-cols-2 divide-x divide-y rounded-xl border md:grid-cols-4 md:divide-y-0">
      {facts.map((fact) => (
        <div key={fact.label} className="space-y-1 px-5 py-4">
          <dt className="text-muted-foreground text-sm">{fact.label}</dt>
          <dd
            className={cn('font-mono text-xl font-semibold tabular-nums', fact.value > 0 && fact.attention)}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
