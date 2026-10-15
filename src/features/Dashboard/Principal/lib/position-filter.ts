/**
 * Saneo del filtro de puestos del tablero.
 *
 * Los `positionIds` llegan del cliente (`?puestos=` de la URL, partida por comas) y
 * terminan bindeados dentro de una consulta SQL cruda, así que se validan antes de usarse.
 * Lógica pura, con test: el comportamiento que importa acá es que el filtro falle CERRADO.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deja sólo los `positionIds` que son uuid válidos.
 *
 * - `undefined` = no vino filtro → no se acota nada.
 * - Array (aunque quede VACÍO) = vino filtro → se acota.
 *
 * Si el caller mandó ids y ninguno es un uuid, el resultado es `[]`, no `undefined`: un
 * filtro que falla abierto ensancha el resultado y devolvería TODOS los puestos de la
 * empresa, que es justo lo contrario de lo que se pidió.
 */
export function sanitizePositionIds(positionIds?: readonly string[]): string[] | undefined {
  if (!positionIds || positionIds.length === 0) return undefined;
  return positionIds.filter((id) => UUID_RE.test(id));
}

/** `where` de Prisma para el filtro; `in: []` no matchea ninguna fila. */
export function positionFilter(positionIds: readonly string[] | undefined) {
  return positionIds === undefined ? {} : { company_position: { in: [...positionIds] } };
}
