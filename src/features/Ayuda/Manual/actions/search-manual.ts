'use server';

import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { z } from 'zod';
import { canManual } from '../../lib/access.server';
import { visibleGuides } from '../lib/guide-access';
import { getManual } from '../lib/manual.server';
import { searchGuides } from '../lib/search-index.server';

const logger = new Logger('features/Ayuda/Manual/search');

const querySchema = z.string().trim().min(2).max(100);

/**
 * Busca en el texto completo de las guías que el usuario puede abrir. Los permisos se leen acá,
 * de la sesión: no se confía en nada que mande el navegador.
 */
export async function searchManual(query: string) {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return [];

  // Sin `ayuda:manual:view` no hay resultados (ni error): el buscador no debe romper la pantalla.
  if (!(await canManual())) return [];

  try {
    const permissions = await getUserPermissionsMapServer();
    const guides = visibleGuides(getManual().guides, permissions);
    return searchGuides(guides, parsed.data);
  } catch (error) {
    logger.error('Error al buscar en el manual', { data: { error } });
    throw error;
  }
}

export type ManualSearchResults = Awaited<ReturnType<typeof searchManual>>;
