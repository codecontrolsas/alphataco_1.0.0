/**
 * Ids deterministas de la demo: uuid v5 (sha1) sobre un namespace propio.
 *
 * El reset diario borra y vuelve a crear todo con los MISMOS ids, asi los links que alguien
 * guardo de la demo (un empleado, un parte, una OT) siguen funcionando al dia siguiente.
 */
import { uuidV5 } from '../../lib/uuid-v5.ts';

/** Namespace fijo de la demo. No cambiarlo: cambiaria todos los ids. */
const DEMO_NAMESPACE = '5f0c2a9e-7d41-4b6e-9a3c-1e8d2f4b7c60';

/** `demoId('employee', 17)` devuelve siempre el mismo uuid. */
export function demoId(kind: string, key: string | number): string {
  return uuidV5(`${kind}:${key}`, DEMO_NAMESPACE);
}

/**
 * Ids que `get_kpi_range` (prisma/sql/kpis.sql) tiene escritos a mano. La demo crea estos
 * registros con estos ids exactos para que los graficos de KPIs tengan datos.
 */
export const KPI_FIXED_IDS = {
  typeTractor: 'ea07ff34-13fb-4483-b5bc-8389e41c7d89',
  typeChasis: '5dc2bc44-de86-4e1d-ae0c-87eafd60dccf',
  customerInternal: 'fecde2b8-f310-495d-9d70-847c9ebfa890',
} as const;
