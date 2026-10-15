import { LEVEL_TEXT_CLASS } from '@/features/Dashboard/lib/chart-thresholds';
import { formatPercentOrDash, NO_DATA_LABEL } from '@/features/Dashboard/lib/metric';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { argentinaDate, formatLongDateAr } from '@/shared/lib/argentina-time';
import { getAbsenteeismSummary } from '../actions.server';

const formatCount = (value: number | undefined) =>
  value === undefined ? NO_DATA_LABEL : value.toLocaleString('es-AR');

export async function SummaryCards() {
  const data = await getAbsenteeismSummary();
  // Sin dotación no hay porcentaje: la función SQL devuelve 0 y eso leería como "sin ausentismo".
  const absenteeism = data && data.dotacionActual > 0 ? data.porcentajeAusentismo : null;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Medición del día de hoy: {formatLongDateAr(argentinaDate())}</div>
      {!data && (
        <p role="status" className="text-xs text-muted-foreground">
          No hay datos de ausentismo para hoy.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Dotación día anterior" value={formatCount(data?.dotacionAnterior)} />
        <MetricCard
          label="Altas"
          value={<span className={data ? LEVEL_TEXT_CLASS.ok : undefined}>{formatCount(data?.altas)}</span>}
        />
        <MetricCard
          label="Bajas"
          value={<span className={data ? LEVEL_TEXT_CLASS.danger : undefined}>{formatCount(data?.bajas)}</span>}
        />
        <MetricCard
          label="Total ausentes"
          value={<span className={data ? LEVEL_TEXT_CLASS.warn : undefined}>{formatCount(data?.totalAusentes)}</span>}
        />
        <MetricCard label="Dotación actual" value={formatCount(data?.dotacionActual)} />
        <MetricCard
          label="% Ausentismo diario"
          value={
            <span className={absenteeism === null ? undefined : LEVEL_TEXT_CLASS.warn}>
              {formatPercentOrDash(absenteeism)}
            </span>
          }
          hint={absenteeism === null && data ? 'sin dotación para medir' : undefined}
        />
      </div>
    </div>
  );
}
