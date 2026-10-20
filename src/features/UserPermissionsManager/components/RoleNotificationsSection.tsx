'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  type NotificationChannel,
  type NotificationEventKey,
  type NotificationPermission,
} from '@/features/Notifications/notification-catalog';
import { AlertCircle, TriangleAlert } from 'lucide-react';
import { useId, useMemo } from 'react';
import type { RoleNotificationsDraft } from '../hooks/useRoleNotificationsDraft';
import { permissionKey } from '../lib/permission-rules';
import type { PermissionModule, PermissionPair, PermissionTab } from '../lib/permission-types';

const CHANNELS: NotificationChannel[] = ['in_app', 'email'];

interface RoleNotificationsSectionProps {
  draft: RoleNotificationsDraft;
  disabled?: boolean;
  saveError?: string | null;
  /**
   * Permisos marcados en el editor y catálogo de módulos, para avisar cuando el rol no tiene el permiso
   * mínimo de un aviso. Sin ellos (roles de sistema, que no se editan) no se avisa.
   */
  permissionCheck?: { modules: PermissionModule[]; permissions: PermissionPair[] };
}

function findTab(tabs: PermissionTab[], slug: string): PermissionTab | null {
  for (const tab of tabs) {
    if (tab.slug === slug) return tab;
    const nested = findTab(tab.subtabs, slug);
    if (nested) return nested;
  }
  return null;
}

/** Arma «¿el rol tiene alguno de estos permisos?» sobre lo marcado en el editor (aún sin guardar). */
function useHasAnyPermission(check: RoleNotificationsSectionProps['permissionCheck']) {
  return useMemo(() => {
    if (!check) return null;
    const granted = new Set(check.permissions.map((pair) => permissionKey(pair.tabId, pair.actionId)));
    return (requires: readonly NotificationPermission[]) =>
      requires.some((req) => {
        const module = check.modules.find((item) => item.slug === req.module);
        const tab = module ? findTab(module.tabs, req.tab) : null;
        const action = tab?.actions.find((item) => item.slug === req.action);
        return Boolean(tab && action && granted.has(permissionKey(tab.id, action.id)));
      });
  }, [check]);
}

/**
 * Sección «Notificaciones» del rol (#786): por cada aviso, si llega a la campanita y/o por email. No guarda
 * sola: cambia el borrador y se persiste con el mismo «Guardar» que el resto del rol.
 */
export function RoleNotificationsSection({
  draft,
  disabled = false,
  saveError,
  permissionCheck,
}: RoleNotificationsSectionProps) {
  const titleId = useId();
  const { baselineQuery, isNewRole, isBaselineReady, isActive, toggle } = draft;
  const hasAnyPermission = useHasAnyPermission(permissionCheck);
  const canEdit = isBaselineReady && !disabled;

  const groups = useMemo(() => {
    const byModule = new Map<string, NotificationEventKey[]>();
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const label = NOTIFICATION_EVENTS[key].moduleLabel;
      byModule.set(label, [...(byModule.get(label) ?? []), key]);
    }
    return [...byModule.entries()];
  }, []);

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div>
        <h3 id={titleId} className="text-sm font-semibold">
          Notificaciones
        </h3>
        <p className="text-muted-foreground text-sm">
          Qué avisos reciben los usuarios con este rol. Solo les llegan si además tienen el permiso indicado.
        </p>
      </div>

      {saveError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}

      {!isNewRole && baselineQuery.isPending ? (
        <div className="space-y-2" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !isNewRole && baselineQuery.isError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>
            No se pudieron cargar los avisos del rol. Cerrá y volvé a abrir el editor.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="divide-y rounded-xl border">
          {groups.map(([moduleLabel, keys]) => (
            <div key={moduleLabel} className="px-4 py-3">
              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">{moduleLabel}</p>
              <ul className="space-y-3">
                {keys.map((key) => {
                  const event = NOTIFICATION_EVENTS[key];
                  const allowed = hasAnyPermission ? hasAnyPermission(event.requires) : true;
                  const anyOn = CHANNELS.some((channel) => isActive(key, channel));
                  return (
                    <li key={key} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{event.label}</p>
                        <p className="text-muted-foreground text-xs text-pretty">{event.description}</p>
                        <p className="text-muted-foreground text-xs">Requiere: {event.requiresLabel}</p>
                        {!allowed && anyOn ? (
                          <p className="text-warn-subtle-foreground mt-1 flex items-center gap-1 text-xs">
                            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
                            No lo van a recibir mientras el rol no tenga ese permiso.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-4">
                        {CHANNELS.map((channel) => {
                          const id = `${titleId}-${key}-${channel}`;
                          return (
                            <label
                              key={channel}
                              htmlFor={id}
                              className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"
                            >
                              <Checkbox
                                id={id}
                                checked={isActive(key, channel)}
                                disabled={!canEdit}
                                onCheckedChange={(value) => toggle(key, channel, value === true)}
                                aria-label={`${event.label}: ${NOTIFICATION_CHANNEL_LABELS[channel]}`}
                              />
                              {NOTIFICATION_CHANNEL_LABELS[channel]}
                            </label>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
