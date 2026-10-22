'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';

const logger = new Logger('features/Checklists/equipment-templates');

/**
 * Plantillas de checklist activas que aplican a un equipo, para el flujo QR anónimo
 * (`/maintenance/equipment/[id]/checklists`).
 *
 * La empresa sale del equipo, nunca de la sesión. Una plantilla aplica si su
 * `checklist_template_sub_types` incluye el subtipo del vehículo, si su
 * `checklist_template_types` incluye su tipo, o si no declara ninguna restricción.
 *
 * Reemplaza al filtro por título hardcodeado (`'Transporte SP-ANAY - CHK - HYS - 03'`) y
 * deja fuera los `custom_form` legacy: el detalle del flujo QR sólo sabe abrir plantillas
 * normalizadas, así que un `custom_form` listado ahí era un enlace muerto.
 *
 * Devuelve un resultado discriminado para que la página pueda distinguir los tres casos:
 * `not_found` (el equipo no existe), `error` (falló la consulta) y `ok` con la lista, que
 * puede estar vacía si el equipo existe pero no tiene plantillas aplicables. Antes los tres
 * colapsaban en `[]` y un fallo de BD se veía como "este equipo no tiene checklists".
 */
export type ChecklistTemplatesForEquipmentResult =
  | { status: 'ok'; templates: ChecklistTemplateForEquipment[] }
  | { status: 'not_found' }
  | { status: 'error' };

export const fetchChecklistTemplatesForEquipment = async (
  equipmentId: string
): Promise<ChecklistTemplatesForEquipmentResult> => {
  try {
    const vehicle = await prisma.vehicles.findUnique({
      where: { id: equipmentId },
      select: { company_id: true, type: true, subType: true },
    });
    if (!vehicle?.company_id) return { status: 'not_found' };

    const templates = await prisma.checklist_templates.findMany({
      where: withCompany({ is_active: true }, vehicle.company_id),
      select: {
        id: true,
        name: true,
        description: true,
        code: true,
        created_at: true,
        checklist_template_sub_types: { select: { sub_type_id: true } },
        checklist_template_types: { select: { type_id: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const applicable = templates
      .filter((template) => {
        const subTypeIds = template.checklist_template_sub_types
          .map((st) => st.sub_type_id)
          .filter((id): id is string => Boolean(id));
        const typeIds = template.checklist_template_types
          .map((t) => t.type_id)
          .filter((id): id is string => Boolean(id));

        // Sin restricciones declaradas, la plantilla aplica a todos los equipos.
        if (subTypeIds.length === 0 && typeIds.length === 0) return true;

        return (
          (vehicle.subType != null && subTypeIds.includes(vehicle.subType)) ||
          (vehicle.type != null && typeIds.includes(vehicle.type))
        );
      })
      .map((template) => ({
        id: template.id,
        name: template.name,
        code: template.code,
        description: template.description,
        created_at: template.created_at,
      }));

    return { status: 'ok', templates: applicable };
  } catch (error) {
    logger.error('Error al obtener las plantillas de checklist del equipo', { data: { error, equipmentId } });
    return { status: 'error' };
  }
};

export type ChecklistTemplateForEquipment = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  created_at: Date | null;
};
