import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { cache } from 'react';
import { getEquipmentsWithDeviationsMetrics } from '../EquiposConDesvios/actions.server';
import { getOperacionesPipelineSummary } from '../Pipeline/OperacionesPipeline/actions/pipeline-summary.server';
import { getTallerPipelineSummary } from '../Pipeline/TallerPipeline/actions/pipeline-summary.server';

/**
 * Contadores de la sub-navegación de Mantenimiento. Cada función va envuelta en `React.cache` (sin
 * argumentos: nada que comparar por referencia) para que, dentro de un mismo request, la sección activa
 * y su contador no repitan la consulta. `null` = no se pudo calcular: la UI muestra "—", nunca un 0.
 */

/** Resúmenes completos con `React.cache`: el contenido de la sección y su contador comparten UNA consulta por request. */
export const getTallerSummaryCached = cache(() => getTallerPipelineSummary());
export const getOperacionesSummaryCached = cache(() => getOperacionesPipelineSummary());
export const getDeviationsMetricsCached = cache(() => getEquipmentsWithDeviationsMetrics());

/** Pestaña de permiso de cada paso de Taller (misma que usa el resumen del pipeline). */
const TALLER_STEP_TABS: Record<string, string> = {
  schedule: 'pedidos_pendientes',
  confirmed: 'pedidos_confirmados',
  in_workshop: 'ordenes_mantenimiento',
  approvals: 'bandeja_aprobaciones',
};

/**
 * Taller = suma de los pasos que el usuario puede ver. Un paso sin permiso no cuenta; uno permitido que no se
 * pudo contar vuelve el total `null` (sería un número inventado).
 */
export const getTallerSectionCount = cache(async (): Promise<number | null> => {
  const { counts } = await getTallerSummaryCached();
  const allowed = await Promise.all(
    Object.entries(TALLER_STEP_TABS).map(async ([id, tab]) => ({
      id,
      ok: await checkPermissionServer('mantenimiento', tab, 'view'),
    }))
  );
  const parts = allowed.filter((step) => step.ok).map((step) => counts[step.id] ?? null);
  return parts.length > 0 && parts.every((part): part is number => part !== null)
    ? parts.reduce((sum, part) => sum + part, 0)
    : null;
});

/** Operaciones = paso "Validar". */
export const getOperacionesSectionCount = cache(async (): Promise<number | null> => {
  const { counts } = await getOperacionesSummaryCached();
  return counts.validate ?? null;
});

/**
 * Gestión = Operaciones + Taller. Se suma lo que el usuario puede ver; si una parte visible no se pudo contar,
 * el total es `null` (sería un número inventado).
 */
export const getGestionSectionCount = cache(async (): Promise<number | null> => {
  const [canOperaciones, canTaller] = await Promise.all([
    checkPermissionServer('mantenimiento', 'maint_operaciones', 'view'),
    checkPermissionServer('mantenimiento', 'maint_taller', 'view'),
  ]);
  const [operaciones, taller] = await Promise.all([
    canOperaciones ? getOperacionesSectionCount() : 0,
    canTaller ? getTallerSectionCount() : 0,
  ]);
  return operaciones !== null && taller !== null ? operaciones + taller : null;
});

/** Equipos con Desvíos = cantidad de equipos con desvíos pendientes. */
export const getDeviationsSectionCount = cache(async (): Promise<number | null> => {
  const metrics = await getDeviationsMetricsCached();
  return metrics ? metrics.total : null;
});
