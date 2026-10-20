'use client';

import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  type NotificationChannel,
} from '@/features/Notifications/notification-catalog';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { getRoleNotificationSettings, type RoleNotificationChanges } from '../actions/roleNotifications.server';

export const roleNotificationKeys = {
  role: (roleId: number) => ['role-notifications', roleId] as const,
};

const pairKey = (eventKey: string, channel: NotificationChannel) => `${eventKey}:${channel}`;

function splitKey(key: string): { eventKey: string; channel: NotificationChannel } {
  const index = key.lastIndexOf(':');
  return { eventKey: key.slice(0, index), channel: key.slice(index + 1) as NotificationChannel };
}

/** Un rol nuevo arranca con los canales sugeridos del catálogo. */
const DEFAULT_PAIRS = NOTIFICATION_EVENT_KEYS.flatMap((eventKey) =>
  NOTIFICATION_EVENTS[eventKey].defaultChannels.map((channel) => pairKey(eventKey, channel))
);

/**
 * Estado de la sección «Notificaciones» del editor de rol. Mismo diseño que los tipos de equipamiento:
 * baseline leído de la base al abrir + borrador local con solo lo cambiado, y al guardar altas y bajas
 * explícitas.
 */
export function useRoleNotificationsDraft({ roleId, enabled }: { roleId: number | null; enabled: boolean }) {
  const baselineQuery = useQuery({
    queryKey: roleNotificationKeys.role(roleId ?? 0),
    queryFn: () => getRoleNotificationSettings(roleId ?? 0),
    enabled: enabled && roleId !== null,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  // pairKey → activo. Solo lo que difiere del baseline.
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const isNewRole = roleId === null;
  const baselineData = baselineQuery.data;
  const baseline = useMemo(
    () => new Set(isNewRole ? DEFAULT_PAIRS : (baselineData ?? []).map((pair) => pairKey(pair.eventKey, pair.channel))),
    [isNewRole, baselineData]
  );
  const isBaselineReady = isNewRole || (baselineQuery.isSuccess && !baselineQuery.isFetching);

  const active = useMemo(() => {
    const result = new Set(baseline);
    for (const [key, on] of Object.entries(draft)) {
      if (on) result.add(key);
      else result.delete(key);
    }
    return result;
  }, [baseline, draft]);

  const changes = useMemo<RoleNotificationChanges>(() => {
    // Un rol nuevo no tiene nada en la base: todo lo activo es alta.
    if (isNewRole) return { add: [...active].map(splitKey), remove: [] };
    const add: RoleNotificationChanges['add'] = [];
    const remove: RoleNotificationChanges['remove'] = [];
    for (const [key, on] of Object.entries(draft)) {
      if (on && !baseline.has(key)) add.push(splitKey(key));
      if (!on && baseline.has(key)) remove.push(splitKey(key));
    }
    return { add, remove };
  }, [isNewRole, active, baseline, draft]);

  const toggle = useCallback(
    (eventKey: string, channel: NotificationChannel, on: boolean) => {
      const key = pairKey(eventKey, channel);
      setDraft((prev) => {
        const next = { ...prev };
        if (baseline.has(key) === on) delete next[key];
        else next[key] = on;
        return next;
      });
    },
    [baseline]
  );

  const isActive = useCallback(
    (eventKey: string, channel: NotificationChannel) => active.has(pairKey(eventKey, channel)),
    [active]
  );

  const reset = useCallback(() => setDraft({}), []);

  return {
    baselineQuery,
    isNewRole,
    isBaselineReady,
    isActive,
    changes,
    hasChanges: isNewRole ? changes.add.length > 0 : Object.keys(draft).length > 0,
    toggle,
    reset,
  };
}

export type RoleNotificationsDraft = ReturnType<typeof useRoleNotificationsDraft>;
