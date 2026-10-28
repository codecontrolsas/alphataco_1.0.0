'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { MetricCard, type MetricTone } from '@/shared/components/common/MetricCard';
import type { getEmployeeStatusMetrics } from '../actions.server';

type Metrics = Awaited<ReturnType<typeof getEmployeeStatusMetrics>>;

interface EmployeeMetricsProps {
  /** Mismo `tableId` que la tabla: de ahí sale el prefijo de sus params en la URL. */
  tableId: string;
  metrics: Metrics;
  /** Con `documentacion` apagado solo queda «Empleados activos» (el estado documental está congelado y oculto). */
  showDocumentStatus: boolean;
}

/** Tarjetas del listado de activos. Cada una aplica su estado como filtro de la tabla. */
export function EmployeeMetrics({ tableId, metrics, showDocumentStatus }: EmployeeMetricsProps) {
  const [statusFilter, setStatusFilter] = useDataTableFilter(tableId, 'status');

  const allCards: { status: string | null; label: string; value: number; hint: string; tone: MetricTone }[] = [
    { status: null, label: 'Empleados activos', value: metrics.total, hint: 'Ver todos', tone: 'default' },
    {
      status: 'Completo',
      label: 'Legajo completo',
      value: metrics.byStatus.Completo ?? 0,
      hint: 'Documentación al día',
      tone: 'ok',
    },
    {
      status: 'Incompleto',
      label: 'Legajo incompleto',
      value: metrics.byStatus.Incompleto ?? 0,
      hint: 'Falta documentación',
      tone: 'warn',
    },
    {
      status: 'Completo_con_doc_vencida',
      label: 'Con doc. vencida',
      value: metrics.byStatus.Completo_con_doc_vencida ?? 0,
      hint: 'Requieren acción',
      tone: 'danger',
    },
  ];
  const cards = showDocumentStatus ? allCards : allCards.filter((card) => card.status === null);

  return (
    <div
      className="grid grid-cols-2 gap-4 xl:grid-cols-4"
      role="group"
      aria-label={showDocumentStatus ? 'Estado documental de los empleados activos' : 'Empleados activos'}
    >
      {cards.map((card) => (
        <MetricCard
          key={card.label}
          label={card.label}
          value={card.value}
          hint={card.hint}
          tone={card.tone}
          pressed={statusFilter === card.status}
          onSelect={() => setStatusFilter(statusFilter === card.status ? null : card.status)}
        />
      ))}
    </div>
  );
}
