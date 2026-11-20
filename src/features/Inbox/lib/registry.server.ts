import 'server-only';

import { getHiddenEquipmentTypeIds } from '@/features/Mantenimiento/utils/equipmentTypeVisibility';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { NoActiveCompanyError, getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { maintenanceInboxProvider } from '../providers/maintenance.server';
import {
  INBOX_SECTION_LIMIT,
  INBOX_SECTION_LIMIT_ALL,
  type InboxCtx,
  type InboxData,
  type InboxGroup,
  type InboxProvider,
} from './types';

const logger = new Logger('Inbox/registry');

/** Proveedores de la bandeja. Para sumar compras o documentación se agrega uno acá. */
const PROVIDERS: readonly InboxProvider[] = [maintenanceInboxProvider];

/** ¿Algún proveedor está habilitado para este usuario? (sin base: solo permisos). Decide el ícono y el enlace. */
export function isInboxEnabled(permissions: Readonly<Record<string, boolean>>): boolean {
  return PROVIDERS.some((provider) => provider.isEnabled(permissions));
}

async function buildCtx(): Promise<InboxCtx> {
  const [companyId, permissions, hiddenTypeIds] = await Promise.all([
    getActiveCompanyId(),
    getUserPermissionsMapServer(),
    getHiddenEquipmentTypeIds(),
  ]);
  return { companyId, permissions, hiddenTypeIds };
}

/**
 * Todo lo que el usuario tiene para decidir. `React.cache` evita repetir las consultas dentro de un request; cada
 * proveedor va en un `Promise.allSettled`: uno caído muestra su error en su grupo y no tumba la pantalla.
 *
 * `type` filtra por categoría (`task_authorization`…) o por proveedor/módulo (`mantenimiento`); con una categoría
 * puntual se levanta el tope de ítems («Ver todo»).
 */
export const getInboxForUser = cache(async (type?: string): Promise<InboxData> => {
  const ctx = await buildCtx();
  const enabled = PROVIDERS.filter((provider) => provider.isEnabled(ctx.permissions));
  const byProvider = type ? enabled.filter((provider) => provider.id === type || provider.moduleSlug === type) : [];
  // `type` que no es un proveedor: se interpreta como categoría y se la pide a todos.
  const itemType = type && byProvider.length === 0 ? type : undefined;
  const selected = byProvider.length > 0 ? byProvider : enabled;
  const limit = itemType ? INBOX_SECTION_LIMIT_ALL : INBOX_SECTION_LIMIT;

  const results = await Promise.allSettled(
    selected.map((provider) => provider.fetchPending(ctx, { limit, type: itemType }))
  );

  const groups: InboxGroup[] = results.map((result, index) => {
    const provider = selected[index];
    if (result.status === 'fulfilled') {
      return { providerId: provider.id, moduleSlug: provider.moduleSlug, label: provider.label, sections: result.value };
    }
    logger.error('Error al cargar un proveedor de la bandeja', { data: { error: result.reason, provider: provider.id } });
    return {
      providerId: provider.id,
      moduleSlug: provider.moduleSlug,
      label: provider.label,
      sections: [],
      error: 'No se pudo cargar esta parte de la bandeja',
    };
  });

  const decisionCount = groups
    .flatMap((group) => group.sections)
    .filter((section) => section.kind === 'decision' && !section.error)
    .reduce((sum, section) => sum + section.total, 0);

  return { groups, decisionCount };
});

/**
 * Datos del ícono del header, que corre en TODAS las páginas: la empresa, los permisos y los tipos ocultos se resuelven
 * una sola vez y en paralelo, y el contador solo se pide si algún proveedor está habilitado. `null` = no mostrar el ícono
 * (sin proveedor habilitado o sin empresa activa). El contador es `null` si no se pudo calcular.
 */
export const getInboxBellData = cache(async (): Promise<{ companyId: string; count: number | null } | null> => {
  let ctx: InboxCtx;
  try {
    ctx = await buildCtx();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) return null;
    throw error;
  }
  const enabled = PROVIDERS.filter((provider) => provider.isEnabled(ctx.permissions));
  if (enabled.length === 0) return null;

  try {
    const counts = await Promise.all(enabled.map((provider) => provider.countPending(ctx)));
    return { companyId: ctx.companyId, count: counts.reduce((sum, count) => sum + count, 0) };
  } catch (error) {
    logger.error('Error al contar la bandeja', { data: { error } });
    return { companyId: ctx.companyId, count: null };
  }
});

/** Contador del header: decisiones pendientes de todos los proveedores habilitados (`'use cache'` en cada uno). */
export const getInboxDecisionCount = cache(async (): Promise<number | null> => {
  try {
    const ctx = await buildCtx();
    const enabled = PROVIDERS.filter((provider) => provider.isEnabled(ctx.permissions));
    if (enabled.length === 0) return 0;
    const counts = await Promise.all(enabled.map((provider) => provider.countPending(ctx)));
    return counts.reduce((sum, count) => sum + count, 0);
  } catch (error) {
    logger.error('Error al contar la bandeja', { data: { error } });
    return null;
  }
});
