'use client';

import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import { Logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface UseCatalogTableOptions {
  permissionsMap: Record<string, boolean>;
  /** Key de la query de la tabla (se invalida tras activar o desactivar). */
  queryKey: string;
  loggerName: string;
  /** Acción de servidor que activa o desactiva el registro. */
  toggleActive: (id: string, isActive: boolean) => Promise<unknown>;
  messages: { activated: string; deactivated: string; error: string };
}

/**
 * Estado que repiten las tablas del catálogo de ropa (marcas, artículos, talles): permisos, diálogo de
 * alta/edición y activar/desactivar un registro.
 */
export function useCatalogTable<T extends { id: string; is_active: boolean }>({
  permissionsMap,
  queryKey,
  loggerName,
  toggleActive,
  messages,
}: UseCatalogTableOptions) {
  const permissions = usePermissionChecker(permissionsMap);
  const queryClient = useQueryClient();
  const logger = useMemo(() => new Logger(loggerName), [loggerName]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((row: T) => {
    setEditing(row);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  const handleToggleActive = useCallback(
    async (row: T) => {
      logger.debug('Toggling active status', { data: { id: row.id, isActive: row.is_active } });
      try {
        await toggleActive(row.id, !row.is_active);
        toast.success(row.is_active ? messages.deactivated : messages.activated);
        await queryClient.invalidateQueries({ queryKey: [queryKey] });
      } catch (error) {
        logger.error('Error toggling active status', { data: { error } });
        toast.error(messages.error);
      }
    },
    [logger, toggleActive, messages, queryClient, queryKey]
  );

  return { permissions, formOpen, setFormOpen, editing, openCreate, openEdit, closeForm, handleToggleActive };
}
