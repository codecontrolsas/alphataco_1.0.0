import type { MobilePermissions } from '../lib/user-permissions';

/**
 * Qué puede ver de Capacitaciones (HSE) el usuario de la app móvil, con las reglas de la web:
 *
 * - Lista y detalle (`getHseTrainingsPaginated`, `getHseTrainingDetail`): `view` de la pestaña `capacitaciones`.
 * - Sesiones presenciales (actas de dictado): la web las gatea aparte con `view` de `actas`
 *   (`getHseTrainingInstructorsAndRecords`). Sin ese permiso no viajan ni la lista de sesiones ni «próxima sesión».
 *
 * El módulo `hse` encendido lo resuelve la ruta (`module: 'hse'`).
 */
export function resolveTrainingAccess(perms: MobilePermissions) {
  return {
    list: perms.has('hse:capacitaciones:view'),
    sessions: perms.has('hse:actas:view'),
  };
}

export type TrainingAccess = ReturnType<typeof resolveTrainingAccess>;
