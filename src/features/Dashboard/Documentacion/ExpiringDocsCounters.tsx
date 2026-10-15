import { Logger } from '@/lib/logger';
import { loadEmployeeExpiringRows, loadVehicleExpiringRows } from './lib/expiring-rows.server';

const logger = new Logger('features/Dashboard/Documentacion/ExpiringDocsCounters');

/** Cantidad con el MISMO conjunto de filas que la lista; sin permiso o con error: "—", nunca 0. */
async function Counter({ load }: { load: () => Promise<readonly unknown[]> }) {
  let label = '—';
  try {
    label = (await load()).length.toLocaleString('es-AR');
  } catch (error) {
    // Sin permiso o falla de carga: no medible, se muestra "—".
    logger.error('Error al calcular el contador de documentos por vencer', { data: { error } });
  }
  return <span className="tabular-nums">{label}</span>;
}

export function EmployeeExpiringCounter() {
  return <Counter load={loadEmployeeExpiringRows} />;
}

export function VehicleExpiringCounter() {
  return <Counter load={loadVehicleExpiringRows} />;
}
