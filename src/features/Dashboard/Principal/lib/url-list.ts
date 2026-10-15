/**
 * Filtros del Dashboard que viven en la URL (antes en cookies). Módulo sin directiva: lo leen los
 * Server Components de las secciones.
 */

/** Puestos de la sección «Recursos Humanos». */
export const POSITIONS_PARAM = 'puestos';
/** Tipos de equipo de la sección «Estado de Equipos». */
export const VEHICLE_TYPES_PARAM = 'tipos_equipo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee una lista de ids de la URL (`a,b`). `undefined` si no vino; si vino, solo los uuid válidos
 * (puede quedar vacía: el filtro falla cerrado, nunca ensancha el resultado).
 */
export function parseUrlIdList(value: string | string[] | undefined): string[] | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const items = raw
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items || items.length === 0) return undefined;
  return items.filter((item) => UUID_RE.test(item));
}
