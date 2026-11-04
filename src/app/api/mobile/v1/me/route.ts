import { resolveDashboardAccess } from '@/features/MobileApi/dashboards/access';
import { allowedResources } from '@/features/MobileApi/documents/access';
import { loadMobileAccess } from '@/features/MobileApi/lib/access.server';
import { mobileModulesFor } from '@/features/MobileApi/lib/config';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { resolveSearchAccess, searchableGroups } from '@/features/MobileApi/search/access';
import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';
import { prismaBase } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { runWithTenantContext } from '@/shared/lib/tenant-context';

const MODULE = 'operaciones';
const TAB = 'detalle-parte-diario';

/** Nombres de los roles del usuario en la empresa (`user_roles` es por empresa), en el orden en que se los asignó. */
async function loadRoleNames(userId: string, companyId: string): Promise<string[]> {
  const rows = await prismaSystem.user_roles.findMany({
    where: { user_id: userId, company_id: companyId },
    select: { roles: { select: { name: true } } },
    orderBy: { assigned_at: 'asc' },
  });
  return rows.map((row) => row.roles.name);
}

/**
 * Empresas del usuario, con la misma regla del selector web (`fetchUserCompanies`): las propias (`owner_id`) y las
 * compartidas (`share_company_users`), cada una una sola vez. Va por el cliente de sistema: con el contexto de RLS
 * solo se vería la empresa activa.
 */
async function countUserCompanies(userId: string): Promise<number> {
  const profile = await prismaSystem.profile.findUnique({ where: { credential_id: userId }, select: { id: true } });
  if (!profile) return 0;
  const [owned, shared] = await Promise.all([
    prismaSystem.company.findMany({ where: { owner_id: profile.id }, select: { id: true } }),
    prismaSystem.share_company_users.findMany({
      where: { profile_id: profile.id, is_active: true },
      select: { company_id: true },
    }),
  ]);
  return new Set([...owned.map((company) => company.id), ...shared.map((item) => item.company_id)]).size;
}

/** Usuario, empresa activa y los permisos de las pantallas móviles, todo evaluado por el servidor. */
export const GET = mobileRoute({
  run: async ({ ctx }) => {
    const [user, result, access, enabledModules, roleNames, companyCount] = await Promise.all([
      prismaSystem.user.findUnique({ where: { id: ctx.userId! }, select: { id: true, name: true, email: true } }),
      runWithTenantContext(prismaBase, ctx, async (tx) => {
        const company = await tx.company.findUnique({
          where: { id: ctx.companyId },
          select: { id: true, company_name: true },
        });
        const perms = await tx.$queryRaw<
          { view: boolean; update: boolean; delete: boolean; assign_resources: boolean }[]
        >`
          SELECT
            user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'view') AS view,
            user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'update') AS update,
            user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'delete') AS delete,
            user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'assign_resources') AS assign_resources`;
        return { company, perms: perms[0] };
      }),
      loadMobileAccess(ctx),
      getEnabledModulesFor(ctx.companyId),
      loadRoleNames(ctx.userId!, ctx.companyId),
      countUserCompanies(ctx.userId!),
    ]);
    if (!user || !result.company) return mobileError(404, 'NOT_FOUND', 'Usuario o empresa inexistente.');
    const { employees, equipment, documents, training, perms } = access;
    const dashboards = resolveDashboardAccess(perms, enabledModules);
    const search = resolveSearchAccess(perms, enabledModules);
    const documentResources = allowedResources(documents, enabledModules);
    return mobileJson({
      user,
      company: { id: result.company.id, name: result.company.company_name },
      // Agregado compatible (revisión 2): rol del usuario en la empresa activa y si puede cambiar de empresa.
      // `role` es null si el usuario no tiene rol asignado en esta empresa; con varios, `name` los junta con « / ».
      role: roleNames.length > 0 ? { name: roleNames.join(' / ') } : null,
      roles: roleNames,
      canSwitchCompany: companyCount > 1,
      // Lo que la app puede ofrecer a ESTA empresa (la instancia y la empresa, F3.3); `/capabilities` solo sabe la instancia.
      modules: mobileModulesFor(enabledModules),
      permissions: {
        [MODULE]: { [TAB]: result.perms },
        // Agregado compatible (v1 congelada): lo que el usuario puede ver de Empleados, con las reglas de la web.
        empleados: {
          listActive: employees.listActive,
          listInactive: employees.listInactive,
          record: employees.record,
          personal: employees.personal,
          contact: employees.contact,
          work: employees.work,
          documents: employees.documents.visible,
          diagram: employees.diagram,
          clothing: employees.clothing,
          // Revisión 2: secciones nuevas del legajo y resumen documental en la lista.
          documentSummary: employees.documentList.visible,
          absences: employees.absences,
          trainings: employees.trainings,
        },
        // Agregado compatible: Equipos (solo lectura), por clase de equipo.
        equipos: {
          vehicles: {
            listActive: equipment.vehicle.listActive,
            listInactive: equipment.vehicle.listInactive,
            record: equipment.vehicle.record,
            technical: equipment.vehicle.technical,
            assignment: equipment.vehicle.assignment,
            documents: equipment.vehicle.documents.visible,
            // Revisión 2: resumen documental en la lista, mantenimiento y chofer (partes diarios).
            documentSummary: equipment.vehicle.documentList.visible,
            maintenance: equipment.vehicle.maintenance,
            driver: equipment.reports,
          },
          others: {
            listActive: equipment.other.listActive,
            listInactive: equipment.other.listInactive,
            record: equipment.other.record,
            technical: equipment.other.technical,
            assignment: equipment.other.assignment,
            certifications: equipment.other.certifications,
          },
        },
        // Agregado compatible: Documentación (solo lectura). `resources` ya descuenta los módulos apagados.
        documentacion: {
          resources: documentResources,
          employee: { permanent: documents.employee.permanent, monthly: documents.employee.monthly },
          equipment: { permanent: documents.equipment.permanent, monthly: documents.equipment.monthly },
          company: { permanent: documents.company.permanent, monthly: documents.company.monthly },
          detail: documents.detail,
        },
        // Revisión 3: Capacitaciones (HSE). `sessions` = además ve las actas (sesiones presenciales).
        hse: { trainings: training.list, sessions: training.sessions },
        // Revisión 3: tableros (ve algún widget), avisos (todo usuario con cuenta) y los grupos que puede buscar.
        dashboards: { available: dashboards.available },
        notifications: { available: true },
        search: { groups: searchableGroups(search) },
      },
    });
  },
});
