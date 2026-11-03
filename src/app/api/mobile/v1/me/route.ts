import { allowedResources } from '@/features/MobileApi/documents/access';
import { loadMobileAccess } from '@/features/MobileApi/lib/access.server';
import { mobileModulesFor } from '@/features/MobileApi/lib/config';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileJson } from '@/features/MobileApi/lib/http';
import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';
import { prismaBase } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { runWithTenantContext } from '@/shared/lib/tenant-context';

const MODULE = 'operaciones';
const TAB = 'detalle-parte-diario';

/** Usuario, empresa activa y los permisos de las pantallas móviles, todo evaluado por el servidor. */
export const GET = mobileRoute({
  run: async ({ ctx }) => {
    const [user, result, access, enabledModules] = await Promise.all([
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
    ]);
    if (!user || !result.company) return mobileError(404, 'NOT_FOUND', 'Usuario o empresa inexistente.');
    const { employees, equipment, documents } = access;
    const documentResources = allowedResources(documents, enabledModules);
    return mobileJson({
      user,
      company: { id: result.company.id, name: result.company.company_name },
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
      },
    });
  },
});
