'use client';

import { Button } from '@/components/ui/button';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { AlertTriangle } from 'lucide-react';
import { DETAIL_PARAM_NAMESPACE } from '../constants';
import { useDailyReportStatusSummary } from '../hooks/useDailyReportStatusSummary';
import { useValidationData } from '../hooks/useValidationData';

interface Props {
  dailyReportId: string;
  reportDate: string;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Aviso con hechos reales del parte: líneas sin recursos y líneas con desvíos de personal o
 * equipos. La región `role="status"` vive siempre en el DOM (así un lector de pantalla anuncia
 * el cambio) y se oculta sola cuando no tiene contenido.
 */
export function DailyReportAttentionBanner({ dailyReportId, reportDate }: Props) {
  const { data: summary } = useDailyReportStatusSummary(dailyReportId);
  const { rowsWithDeviationsCount } = useValidationData(dailyReportId, reportDate);
  const [, setStatusFilter] = useDataTableFilter(DETAIL_PARAM_NAMESPACE, 'status');

  const withoutResources = summary?.withoutResources ?? 0;
  const facts = [
    ...(withoutResources > 0 ? [plural(withoutResources, 'línea sin recursos', 'líneas sin recursos')] : []),
    ...(rowsWithDeviationsCount > 0
      ? [`${plural(rowsWithDeviationsCount, 'línea', 'líneas')} con desvíos de personal o equipos`]
      : []),
  ];

  return (
    <div role="status" className="empty:hidden">
      {facts.length > 0 ? (
        <div className="border-warn/35 bg-warn-subtle text-warn-subtle-foreground flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{facts.join(' · ')}</span>
          </p>
          {withoutResources > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setStatusFilter('sin_recursos_asignados')}>
              Ver líneas sin recursos
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
