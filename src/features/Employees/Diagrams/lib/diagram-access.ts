import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';

/**
 * Tabs/subtabs del módulo `empleados` que gobiernan Diagramas (`empleados:<tab>:<acción>`).
 * `employees` se admite porque el formulario de novedades también vive embebido en el detalle del empleado,
 * donde quien edita el legajo puede no tener la subtab `new`.
 */
export type DiagramSubtab = 'old' | 'new' | 'massive_diagram' | 'reports' | 'employees';

export type DiagramAction = 'view' | 'create' | 'update';

const MODULE_SLUG = 'empleados';

/** Exige la acción en AL MENOS una de las tabs indicadas (any-of). */
export async function assertDiagramAction(action: DiagramAction, ...subtabs: DiagramSubtab[]): Promise<void> {
  const results = await Promise.all(subtabs.map((subtab) => checkPermissionServer(MODULE_SLUG, subtab, action)));
  if (!results.some(Boolean)) {
    throw new Error('No tenés permiso para realizar esta operación en Diagramas');
  }
}

/**
 * Exige `view` en AL MENOS una de las subtabs indicadas (firma histórica). Se usa en el servidor para que las
 * acciones no dependan solo de que la UI oculte la pantalla. Para escrituras usar `assertDiagramAction`.
 */
export async function assertDiagramAccess(...subtabs: DiagramSubtab[]): Promise<void> {
  await assertDiagramAction('view', ...subtabs);
}

/**
 * Exige AL MENOS UNO de los pares `[subtab, acción]` indicados. Sirve para los formularios embebidos: crear una
 * novedad se admite con `new:create` o, desde el detalle del empleado, con `employees:update`.
 */
export async function assertAnyDiagramPermission(
  pairs: ReadonlyArray<readonly [DiagramSubtab, DiagramAction]>
): Promise<void> {
  const results = await Promise.all(
    pairs.map(([subtab, action]) => checkPermissionServer(MODULE_SLUG, subtab, action))
  );
  if (!results.some(Boolean)) {
    throw new Error('No tenés permiso para realizar esta operación en Diagramas');
  }
}
