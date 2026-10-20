import { Logger } from '@/lib/logger';
import { updateRoleNotifications, type RoleNotificationChanges } from '../../actions/roleNotifications.server';

const logger = new Logger('RoleManager');

export type NotificationsSaveOutcome =
  | { status: 'unchanged' }
  | { status: 'saved'; added: number; removed: number }
  | { status: 'failed' };

/**
 * Persiste el delta de avisos del rol después de guardar el rol (#786). No lanza: si falla, el rol ya
 * quedó guardado y el diálogo informa el error del bloque.
 */
export async function saveRoleNotificationChanges(
  roleId: number,
  changes: RoleNotificationChanges
): Promise<NotificationsSaveOutcome> {
  if (changes.add.length === 0 && changes.remove.length === 0) return { status: 'unchanged' };
  try {
    const result = await updateRoleNotifications(roleId, changes);
    return { status: 'saved', ...result };
  } catch (error) {
    logger.error('Error al guardar los avisos del rol', { data: { error, roleId } });
    return { status: 'failed' };
  }
}

export function describeNotificationsOutcome(outcome: NotificationsSaveOutcome): string {
  if (outcome.status !== 'saved') return '';
  const parts = [
    outcome.added > 0 ? `se activaron ${outcome.added}` : null,
    outcome.removed > 0 ? `se desactivaron ${outcome.removed}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` Notificaciones: ${parts.join(' y ')}.` : '';
}
