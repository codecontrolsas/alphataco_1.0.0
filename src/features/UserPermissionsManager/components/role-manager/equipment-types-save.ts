import { Logger } from '@/lib/logger';
import { updateRoleHiddenEquipmentTypes } from '../../actions/equipmentTypeVisibility.server';
import type { RoleEquipmentTypeChanges } from '../../hooks/useEquipmentTypeVisibility';

const logger = new Logger('RoleManager');

export type EquipmentTypesSaveOutcome =
  | { status: 'unchanged' }
  | { status: 'saved'; hidden: number; shown: number }
  | { status: 'failed' };

/**
 * Persiste el delta de tipos de equipamiento del rol después de guardar el rol (ticket 690).
 * No lanza: si falla, el rol ya quedó guardado y el diálogo informa el error del bloque.
 */
export async function saveRoleEquipmentTypeChanges(
  roleId: number,
  changes: RoleEquipmentTypeChanges
): Promise<EquipmentTypesSaveOutcome> {
  if (changes.hide.length === 0 && changes.show.length === 0) return { status: 'unchanged' };

  try {
    const result = await updateRoleHiddenEquipmentTypes(roleId, changes);
    return { status: 'saved', ...result };
  } catch (error) {
    logger.error('Error al guardar tipos de equipamiento del rol', { data: { error, roleId } });
    return { status: 'failed' };
  }
}

export function describeEquipmentTypesOutcome(outcome: EquipmentTypesSaveOutcome): string {
  if (outcome.status !== 'saved') return '';
  const parts = [
    outcome.hidden > 0 ? `se ocultaron ${outcome.hidden}` : null,
    outcome.shown > 0 ? `se volvieron a mostrar ${outcome.shown}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` Tipos de equipamiento: ${parts.join(' y ')}.` : '';
}
