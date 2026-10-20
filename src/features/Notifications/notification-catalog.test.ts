import { findTabDef } from '@/features/Permissions/lib/permissions-map-utils';
import { PERMISSIONS } from '@/features/Permissions/permissions-map';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_KEYS, isNotificationEventKey } from './notification-catalog';

/**
 * El catálogo de avisos (#786) se escribe a mano: un permiso mal escrito en `requires` haría que nadie
 * reciba el aviso (la función SQL filtra por ese permiso) sin que el compilador lo note.
 */
describe('catálogo de avisos', () => {
  it('cada permiso requerido existe en el mapa de permisos con esa acción', () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      for (const req of NOTIFICATION_EVENTS[key].requires) {
        const tab = findTabDef(PERMISSIONS as never, req.module, req.tab) as {
          allowedActions?: readonly string[];
        } | null;
        expect(tab, `${key}: ${req.module}:${req.tab}`).not.toBeNull();
        expect(tab?.allowedActions ?? [], `${key}: ${req.module}:${req.tab}:${req.action}`).toContain(req.action);
      }
    }
  });

  it('todo aviso pide al menos un permiso y sugiere al menos un canal', () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      expect(NOTIFICATION_EVENTS[key].requires.length, key).toBeGreaterThan(0);
      expect(NOTIFICATION_EVENTS[key].defaultChannels.length, key).toBeGreaterThan(0);
    }
  });

  it('los avisos de la lista fija son solo los de los jobs que ya mandaban mail', () => {
    const legacy = NOTIFICATION_EVENT_KEYS.flatMap((key) => {
      const kind = (NOTIFICATION_EVENTS[key] as { legacyKind?: string }).legacyKind;
      return kind ? [kind] : [];
    });
    expect(legacy.sort()).toEqual(['daily_report_deviations', 'documents_expiry', 'stock_batch_expiry']);
  });

  it('reconoce solo las claves del catálogo', () => {
    expect(isNotificationEventKey('purchases.order_decided')).toBe(true);
    expect(isNotificationEventKey('purchases.inventado')).toBe(false);
    expect(isNotificationEventKey('toString')).toBe(false);
  });
});
