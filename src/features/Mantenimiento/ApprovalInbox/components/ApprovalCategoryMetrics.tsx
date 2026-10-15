import { MetricCard } from '@/shared/components/common/MetricCard';

interface ApprovalCategoryMetricsProps {
  /** `null` = no se pudo calcular: se muestra "—", nunca un 0 inventado. */
  authorizations: number | null;
  reassignments: number | null;
  validations: number | null;
  returnedOrders: number | null;
}

/** Las cuatro categorías de la bandeja. "Órdenes devueltas" es informativa y no suma al contador del paso. */
export function ApprovalCategoryMetrics({
  authorizations,
  reassignments,
  validations,
  returnedOrders,
}: ApprovalCategoryMetricsProps) {
  const show = (value: number | null) => (value === null ? '—' : value);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard
        label="Autorizaciones"
        value={show(authorizations)}
        hint="Tareas que agregó un operario"
        tone={authorizations ? 'warn' : 'default'}
      />
      <MetricCard
        label="Reasignaciones"
        value={show(reassignments)}
        hint="Tareas devueltas por un sector"
        tone={reassignments ? 'danger' : 'default'}
      />
      <MetricCard
        label="Validación de cierre"
        value={show(validations)}
        hint="Órdenes con todas sus OTs cerradas"
        tone={validations ? 'brand' : 'default'}
      />
      <MetricCard label="Órdenes devueltas" value={show(returnedOrders)} hint="Devueltas al taller · informativa" />
    </div>
  );
}
