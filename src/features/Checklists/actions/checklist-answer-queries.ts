'use server';

import { templateSectionSelect } from '@/features/Checklists/lib/template-section-select';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Checklists/answer-queries');

/**
 * Obtiene una respuesta específica de checklist por su ID (empresa activa).
 */
export const fetchChecklistAnswerById = async (answerId: string) => {
  try {
    const company_id = await getActiveCompanyId();

    const answer = await prisma.checklist_answers.findFirst({
      where: withCompany({ id: answerId }, company_id),
      select: {
        id: true,
        template_id: true,
        equipment_id: true,
        employee_id: true,
        user_id: true,
        company_id: true,
        answer_data: true,
        result: true,
        observations: true,
        critical_items_failed: true,
        created_at: true,
        updated_at: true,
        ut_checklist_answer_id: true,
        chofer_employee_id: true,
        customer_id: true,
        horometro: true,
        kilometraje: true,
        checklist_templates: {
          select: {
            id: true,
            name: true,
            description: true,
            code: true,
            is_active: true,
            checklist_template_sections: { orderBy: { order_index: 'asc' }, select: templateSectionSelect },
          },
        },
        vehicles: {
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            kilometer: true,
            brand_vehicles: { select: { name: true } },
            model_vehicles: { select: { name: true } },
          },
        },
        profile: { select: { id: true, fullname: true } },
      },
    });

    if (!answer) return null;

    // Si este checklist es de enganche (tiene ut_checklist_answer_id), el equipment_id es el enganche.
    // Si es el del UT, se busca el checklist de enganche que lo referencia.
    let hitchEquipmentId: string | null = null;
    if (answer.ut_checklist_answer_id) {
      hitchEquipmentId = answer.equipment_id;
    } else {
      const hitchAnswer = await prisma.checklist_answers.findFirst({
        where: withCompany({ ut_checklist_answer_id: answer.id }, company_id),
        select: { equipment_id: true },
      });
      hitchEquipmentId = hitchAnswer?.equipment_id ?? null;
    }

    const { checklist_templates, vehicles, profile, ...rest } = answer;

    return {
      ...rest,
      // Alias legacy (`template` / `equipment` / `user`) que consumen las páginas y el PDF.
      template: checklist_templates && {
        ...checklist_templates,
        checklist_template_sections: checklist_templates.checklist_template_sections.map(
          ({ checklist_sections, checklist_template_items, ...section }) => ({
            ...section,
            section: checklist_sections,
            checklist_template_items: checklist_template_items.map(({ checklist_items, ...item }) => ({
              ...item,
              reusable_item: checklist_items,
            })),
          })
        ),
      },
      equipment: vehicles && {
        id: vehicles.id,
        domain: vehicles.domain,
        serie: vehicles.serie,
        intern_number: vehicles.intern_number,
        kilometer: vehicles.kilometer,
        brand: vehicles.brand_vehicles,
        model: vehicles.model_vehicles,
      },
      user: profile,
      hitch_equipment_id: hitchEquipmentId,
    };
  } catch (error) {
    logger.error('Error al obtener la respuesta de checklist', { data: { error, answerId } });
    return null;
  }
};
