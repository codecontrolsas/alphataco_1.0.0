'use client';

import { getModulesWithTabsServer, type ModulesWithTabsData } from '@/features/Permissions/actions/roles.server';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { buildPermissionIndex } from '../lib/permission-rules';

/** Módulos con sus tabs (con los datos del servidor como valor inicial) y el índice de permisos armado sobre ellos. */
export function usePermissionIndex(initialModules: ModulesWithTabsData) {
  const { data: modules } = useQuery({
    queryKey: ['modules-with-tabs'],
    queryFn: () => getModulesWithTabsServer(),
    initialData: initialModules,
    staleTime: 5 * 60 * 1000,
  });
  const index = useMemo(() => buildPermissionIndex(modules), [modules]);
  return { modules, index };
}
