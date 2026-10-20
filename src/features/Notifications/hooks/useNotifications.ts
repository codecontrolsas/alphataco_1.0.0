'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMyNotifications,
  getUnreadNotificationsCount,
  markAllNotificationsRead,
  markNotificationsRead,
} from '../actions/notifications.server';

/** Todas las claves cuelgan de `['notifications', companyId]`: cambiar de empresa no mezcla bandejas. */
export const notificationKeys = {
  all: (companyId: string) => ['notifications', companyId] as const,
  unread: (companyId: string) => ['notifications', companyId, 'unread'] as const,
  list: (companyId: string, onlyUnread: boolean, limit: number) =>
    ['notifications', companyId, 'list', { onlyUnread, limit }] as const,
};

/** Contador de la campanita: polling cada minuto mientras la pestaña está visible. */
export function useUnreadNotificationsCount(companyId: string, initialData: number) {
  return useQuery({
    queryKey: notificationKeys.unread(companyId),
    queryFn: () => getUnreadNotificationsCount(),
    initialData,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationsList(companyId: string, { onlyUnread = false, limit = 20, enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(companyId, onlyUnread, limit),
    queryFn: ({ pageParam }) => getMyNotifications({ cursor: pageParam ?? undefined, limit, onlyUnread }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 30_000,
  });
}

export function useMarkNotificationsRead(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | 'all') => (ids === 'all' ? markAllNotificationsRead() : markNotificationsRead(ids)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all(companyId) }),
  });
}
