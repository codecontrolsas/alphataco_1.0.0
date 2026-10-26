'use server';

import {
  NUEVO_PEDIDO_CREATE,
  NUEVO_PEDIDO_VIEW,
  requireResourceAccess,
} from '@/features/Mantenimiento/shared/resource-access.server';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { CACHE_TAGS } from '@/shared/constants/cache';
import { prisma } from '@/shared/lib/prisma';
import { runInCompanyScope } from '@/shared/lib/tenant-context';
import { cacheLife, cacheTag } from 'next/cache';

const serverLogger = new Logger('Mantenimiento/NuevoPedido/queries');

/**
 * Templates de checklist disponibles para un equipo, según su type y/o subType.
 *
 * `companyId` llega por parámetro y no de la sesión: una función `'use cache'` no tiene
 * request al que preguntarle, y el flujo QR anónimo no tiene empresa activa. El wrapper
 * exportado lo deriva del propio equipo.
 * Cache de 10 minutos — datos casi estáticos.
 */
async function getCachedChecklistTemplatesForEquipment(equipmentId: string, companyId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.ALL);
  cacheLife({ expire: 600, revalidate: 600, stale: 60 });
  return runInCompanyScope(companyId, () => getCachedChecklistTemplatesForEquipmentQuery(equipmentId, companyId));
}

/** Cuerpo de `getCachedChecklistTemplatesForEquipment`: corre dentro de `runInCompanyScope` (la RLS necesita la empresa). */
async function getCachedChecklistTemplatesForEquipmentQuery(equipmentId: string, companyId: string) {
  serverLogger.debug('Obteniendo templates de checklist para equipo', { data: { equipmentId } });

  // 1. Obtener type y subType del equipo
  const vehicle = await prisma.vehicles.findUnique({
    where: { id: equipmentId },
    select: { id: true, type: true, subType: true },
  });

  if (!vehicle) {
    serverLogger.error('Error al obtener equipo', { data: { equipmentId } });
    throw new Error('No se pudo obtener información del equipo');
  }

  // 2. Obtener templates activos DE LA EMPRESA DEL EQUIPO con sus secciones, items y
  //    restricciones de tipo (sin RLS, el filtro por empresa va explícito)
  const templates = await prisma.checklist_templates.findMany({
    where: { is_active: true, company_id: companyId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      checklist_template_types: {
        select: { type_id: true },
      },
      checklist_template_sub_types: {
        select: { sub_type_id: true },
      },
      checklist_template_sections: {
        orderBy: { order_index: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          order_index: true,
          checklist_template_items: {
            orderBy: { order_index: 'asc' },
            select: {
              id: true,
              code: true,
              label: true,
              is_critical: true,
              order_index: true,
            },
          },
        },
      },
    },
  });

  // 3. Filtrar templates que aplican al type o subType del equipo
  const filteredTemplates = templates.filter((template) => {
    const types = template.checklist_template_types;
    const subTypes = template.checklist_template_sub_types;

    // Si el template no tiene restricciones de tipo, aplica a todos
    if (types.length === 0 && subTypes.length === 0) {
      return true;
    }

    // Verificar si coincide por type
    const matchesType = types.some((t) => t.type_id === vehicle.type);
    // Verificar si coincide por subType
    const matchesSubType = subTypes.some((st) => st.sub_type_id === vehicle.subType);

    return matchesType || matchesSubType;
  });

  serverLogger.debug('Templates filtrados', {
    data: {
      equipmentId,
      vehicleType: vehicle.type,
      vehicleSubType: vehicle.subType,
      totalTemplates: templates.length,
      filteredCount: filteredTemplates.length,
    },
  });

  return filteredTemplates;
}

/**
 * Wrapper de `getCachedChecklistTemplatesForEquipment`: resuelve la empresa desde el equipo
 * (nunca desde la sesión) y delega en la versión cacheada.
 */
export async function getChecklistTemplatesForEquipment(equipmentId: string) {
  const { companyId } = await requireResourceAccess('vehicle', equipmentId, {
    dashboardPermissions: [NUEVO_PEDIDO_VIEW, NUEVO_PEDIDO_CREATE],
  });
  return getCachedChecklistTemplatesForEquipment(equipmentId, companyId);
}

export type ChecklistTemplatesForEquipment = Awaited<ReturnType<typeof getChecklistTemplatesForEquipment>>;
export type ChecklistTemplateForEquipment = ChecklistTemplatesForEquipment[number];

/**
 * Obtiene el usuario actual del servidor para verificar si es supervisor.
 * Usa getServerAuthProfile() — NO usa cache (depende del usuario actual).
 */
export async function getCurrentUserForSupervisorCheck() {
  const profile = await getServerAuthProfile();

  if (!profile) {
    return null;
  }

  return {
    id: profile.credentialId, // credential_id de Supabase Auth (para comparar con supervisor_id)
    fullname: profile.fullname ?? 'Usuario',
    email: profile.email ?? '',
  };
}

export type CurrentUserForSupervisorCheck = Awaited<ReturnType<typeof getCurrentUserForSupervisorCheck>>;
