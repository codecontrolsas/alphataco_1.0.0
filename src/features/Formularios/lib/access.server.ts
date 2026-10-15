import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';

/**
 * Permisos de servidor del módulo Formularios (`formularios:formularios`).
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público: el permiso se verifica acá y no en
 * el botón del cliente. NO se usa en lo que consume el QR anónimo de Mantenimiento
 * (`getCurrentProfile`, `fetchChecklistTemplateById`, `CreateChecklistAnswer`).
 *
 * Módulo server-only (NO es una Server Action).
 */

const MODULE_SLUG = 'formularios';
const TAB_SLUG = 'formularios';

export type FormsAction = 'view' | 'create';

const ACTION_VERBS: Record<FormsAction, string> = {
  view: 'ver',
  create: 'crear',
};

/** ¿La sesión tiene la acción en Formularios? */
export async function canForms(action: FormsAction): Promise<boolean> {
  return checkPermissionServer(MODULE_SLUG, TAB_SLUG, action);
}

/** Exige la acción en Formularios; si no la tiene, lanza. */
export async function requireFormsPermission(action: FormsAction): Promise<void> {
  if (!(await canForms(action))) {
    throw new Error(`No tenés permiso para ${ACTION_VERBS[action]} formularios`);
  }
}
