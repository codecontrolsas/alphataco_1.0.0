'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { requireFormsPermission } from '@/features/Formularios/lib/access.server';
import { MODULE_DISABLED_MESSAGE, ModuleDisabledError, requireModule } from '@/features/Modules/server/modules.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import type { TenantTx } from '@/shared/lib/tenant-context';
import { revalidatePath } from 'next/cache';
import { buildTemplatePlan, type ExistingStructure, type PlannedSection } from './lib/template-plan';
import {
  LIMITS,
  kindFromColumns,
  templateCodeFor,
  templateFormSchema,
  type TemplateFormValues,
} from './lib/template-schema';

const logger = new Logger('features/Formularios/TemplateEditor');

/**
 * Editor de plantillas de checklist de la empresa (ticket 805).
 *
 * Toda action exige `formularios:formularios:update` y el módulo `checklists` encendido (sus tablas llevan la
 * compuerta de RLS de ese módulo: sin el chequeo, la escritura fallaría con un error de política sin explicación).
 * La empresa sale del contexto de la transacción (RLS) y además se filtra explícita en cada `where`.
 */
async function guard(): Promise<string> {
  await requireFormsPermission('update');
  await requireModule('checklists');
  return getActiveCompanyId();
}

/** Mensaje legible de los errores esperables; el resto se registra y se devuelve genérico. */
function toFailure<T>(error: unknown, fallback: string, data: Record<string, unknown>): ActionResult<T> {
  if (error instanceof ModuleDisabledError) return fail(MODULE_DISABLED_MESSAGE);
  if (error instanceof Error && error.message.startsWith('No tenés permiso')) return fail(error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return fail('Ya existe otra plantilla con el mismo código. Probá con otro nombre.');
  }
  logger.error(fallback, { data: { ...data, error } });
  return fail(fallback);
}

function revalidateForms(templateId?: string): void {
  revalidatePath('/dashboard/forms');
  if (templateId) revalidatePath(`/dashboard/forms/${templateId}`);
}

const editorItemSelect = {
  id: true,
  code: true,
  label: true,
  input_type: true,
  options: true,
  is_critical: true,
  requires_side_validation: true,
  order_index: true,
} as const;

/** Plantilla de la empresa activa para el editor, con sus valores ya traducidos al formulario. `null` si no existe. */
export async function getChecklistTemplateForEditor(templateId: string) {
  const companyId = await guard();
  try {
    const template = await prisma.checklist_templates.findFirst({
      where: withCompany({ id: templateId }, companyId),
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        is_active: true,
        _count: { select: { checklist_answers: true } },
        checklist_template_types: { select: { type: { select: { name: true } } } },
        checklist_template_sub_types: { select: { sub_type: { select: { name: true } } } },
        checklist_template_sections: {
          orderBy: { order_index: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            checklist_template_items: { orderBy: { order_index: 'asc' }, select: editorItemSelect },
          },
        },
      },
    });
    if (!template) return null;

    const values: TemplateFormValues = {
      name: template.name,
      description: template.description ?? '',
      is_active: template.is_active !== false,
      sections: template.checklist_template_sections.map((section) => ({
        id: section.id,
        code: section.code,
        name: section.name,
        items: section.checklist_template_items.map((item) => {
          const { kind, options } = kindFromColumns(item);
          return {
            id: item.id,
            code: item.code,
            label: item.label,
            kind,
            options,
            is_critical: kind === 'bm' && item.is_critical === true,
            double_side: kind === 'bm' && item.requires_side_validation === true,
          };
        }),
      })),
    };

    return {
      id: template.id,
      code: template.code,
      answersCount: template._count.checklist_answers,
      appliesTo: [
        ...template.checklist_template_types.map((t) => t.type?.name),
        ...template.checklist_template_sub_types.map((s) => s.sub_type?.name),
      ].filter((name): name is string => Boolean(name)),
      values,
    };
  } catch (error) {
    logger.error('Error al obtener la plantilla para el editor', { data: { error, templateId } });
    throw new Error('No se pudo cargar la plantilla. Intente nuevamente.');
  }
}

export type ChecklistTemplateForEditor = NonNullable<Awaited<ReturnType<typeof getChecklistTemplateForEditor>>>;

/** Crea o actualiza las secciones e ítems del plan. Siempre acotado a `templateId`: un id ajeno no toca nada. */
async function applySections(tx: TenantTx, templateId: string, companyId: string, sections: PlannedSection[]) {
  for (const section of sections) {
    let sectionId = section.id;
    if (sectionId) {
      await tx.checklist_template_sections.updateMany({
        where: { id: sectionId, template_id: templateId },
        data: { name: section.name, order_index: section.order_index },
      });
    } else {
      const created = await tx.checklist_template_sections.create({
        data: {
          template_id: templateId,
          company_id: companyId,
          code: section.code,
          name: section.name,
          order_index: section.order_index,
          is_specific: true,
        },
        select: { id: true },
      });
      sectionId = created.id;
    }

    const toCreate: Prisma.checklist_template_itemsCreateManyInput[] = [];
    for (const { id, options, ...item } of section.items) {
      const data = { ...item, options: options ?? Prisma.DbNull };
      if (id) {
        const { code: _code, ...editable } = data;
        await tx.checklist_template_items.updateMany({
          where: { id, template_id: templateId, section_id: sectionId },
          data: { ...editable, updated_at: new Date() },
        });
      } else {
        toCreate.push({ ...data, template_id: templateId, section_id: sectionId, company_id: companyId });
      }
    }
    if (toCreate.length > 0) await tx.checklist_template_items.createMany({ data: toCreate });
  }
}

/** Alta de una plantilla de checklist de la empresa activa. */
export async function createChecklistTemplate(input: TemplateFormValues): Promise<ActionResult<{ id: string }>> {
  try {
    const companyId = await guard();
    const parsed = templateFormSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
    const values = parsed.data;

    const planned = buildTemplatePlan(values);
    if (!planned.ok) return fail(planned.error);

    const id = await prisma.$transaction(async (tx) => {
      const taken = await tx.checklist_templates.findMany({
        where: withCompany({}, companyId),
        select: { code: true },
      });
      const template = await tx.checklist_templates.create({
        data: {
          company_id: companyId,
          code: templateCodeFor(
            values.name,
            taken.map((t) => t.code)
          ),
          name: values.name,
          description: values.description || null,
          is_active: values.is_active,
        },
        select: { id: true },
      });
      await applySections(tx, template.id, companyId, planned.plan.sections);
      return template.id;
    });

    revalidateForms();
    return ok({ id });
  } catch (error) {
    return toFailure(error, 'No se pudo crear la plantilla', {});
  }
}

/**
 * Guarda los cambios de una plantilla. Con respuestas cargadas solo se admite renombrar, reordenar, marcar crítico y
 * agregar (ver `buildTemplatePlan`); la verificación corre dentro de la transacción para que una respuesta que llega a
 * la vez no quede apuntando a un ítem borrado.
 */
export async function updateChecklistTemplate(
  templateId: string,
  input: TemplateFormValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const companyId = await guard();
    const parsed = templateFormSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
    const values = parsed.data;

    const result = await prisma.$transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
      const template = await tx.checklist_templates.findFirst({
        where: withCompany({ id: templateId }, companyId),
        select: {
          id: true,
          _count: { select: { checklist_answers: true } },
          checklist_template_sections: {
            select: {
              id: true,
              code: true,
              checklist_template_items: { select: { id: true, code: true, input_type: true, options: true } },
            },
          },
        },
      });
      if (!template) return fail('No se encontró la plantilla');

      const existing: ExistingStructure = {
        sections: template.checklist_template_sections.map((s) => ({
          id: s.id,
          code: s.code,
          items: s.checklist_template_items,
        })),
      };
      const planned = buildTemplatePlan(values, existing, template._count.checklist_answers > 0);
      if (!planned.ok) return fail(planned.error);
      const { plan } = planned;

      await tx.checklist_templates.updateMany({
        where: withCompany({ id: templateId }, companyId),
        data: {
          name: values.name,
          description: values.description || null,
          is_active: values.is_active,
          updated_at: new Date(),
        },
      });
      if (plan.deleteItemIds.length > 0) {
        await tx.checklist_template_items.deleteMany({
          where: { id: { in: plan.deleteItemIds }, template_id: templateId },
        });
      }
      if (plan.deleteSectionIds.length > 0) {
        await tx.checklist_template_sections.deleteMany({
          where: { id: { in: plan.deleteSectionIds }, template_id: templateId },
        });
      }
      await applySections(tx, templateId, companyId, plan.sections);
      return ok({ id: templateId });
    });

    if (result.ok) revalidateForms(templateId);
    return result;
  } catch (error) {
    return toFailure(error, 'No se pudo guardar la plantilla', { templateId });
  }
}

/**
 * Copia una plantilla (estructura completa, con sus códigos, y los tipos / subtipos de equipo a los que aplica) como
 * una plantilla nueva INACTIVA: es la forma de armar una versión nueva de una que ya tiene respuestas.
 */
export async function duplicateChecklistTemplate(templateId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const companyId = await guard();
    const result = await prisma.$transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
      const source = await tx.checklist_templates.findFirst({
        where: withCompany({ id: templateId }, companyId),
        select: {
          name: true,
          description: true,
          checklist_template_types: { select: { type_id: true } },
          checklist_template_sub_types: { select: { sub_type_id: true } },
          checklist_template_sections: {
            orderBy: { order_index: 'asc' },
            select: {
              id: true,
              section_id: true,
              code: true,
              name: true,
              order_index: true,
              is_required: true,
              is_specific: true,
              checklist_template_items: {
                select: {
                  item_id: true,
                  code: true,
                  label: true,
                  description: true,
                  input_type: true,
                  options: true,
                  is_critical: true,
                  requires_certification: true,
                  certification_validity_days: true,
                  requires_side_validation: true,
                  order_index: true,
                  validation_rules: true,
                },
              },
            },
          },
        },
      });
      if (!source) return fail('No se encontró la plantilla');

      const taken = await tx.checklist_templates.findMany({
        where: withCompany({}, companyId),
        select: { code: true },
      });
      const name = `${source.name.slice(0, LIMITS.name - 9)} (copia)`;
      const copy = await tx.checklist_templates.create({
        data: {
          company_id: companyId,
          code: templateCodeFor(
            name,
            taken.map((t) => t.code)
          ),
          name,
          description: source.description,
          is_active: false,
        },
        select: { id: true },
      });

      for (const section of source.checklist_template_sections) {
        const { id: _id, checklist_template_items: items, ...sectionData } = section;
        const created = await tx.checklist_template_sections.create({
          data: { ...sectionData, template_id: copy.id, company_id: companyId },
          select: { id: true },
        });
        if (items.length > 0) {
          await tx.checklist_template_items.createMany({
            data: items.map((item) => ({
              ...item,
              options: item.options ?? Prisma.DbNull,
              validation_rules: item.validation_rules ?? Prisma.DbNull,
              template_id: copy.id,
              section_id: created.id,
              company_id: companyId,
            })),
          });
        }
      }

      const typeIds = source.checklist_template_types.map((t) => t.type_id).filter((v): v is string => Boolean(v));
      if (typeIds.length > 0) {
        await tx.checklist_template_types.createMany({
          data: typeIds.map((type_id) => ({ template_id: copy.id, type_id, company_id: companyId })),
        });
      }
      const subTypeIds = source.checklist_template_sub_types
        .map((s) => s.sub_type_id)
        .filter((v): v is string => Boolean(v));
      if (subTypeIds.length > 0) {
        await tx.checklist_template_sub_types.createMany({
          data: subTypeIds.map((sub_type_id) => ({ template_id: copy.id, sub_type_id, company_id: companyId })),
        });
      }
      return ok({ id: copy.id });
    });

    if (result.ok) revalidateForms();
    return result;
  } catch (error) {
    return toFailure(error, 'No se pudo duplicar la plantilla', { templateId });
  }
}

/** Borra una plantilla SIN respuestas (con respuestas se desactiva: borrarla rompería el historial). */
export async function deleteChecklistTemplate(templateId: string): Promise<ActionResult<null>> {
  try {
    const companyId = await guard();
    const result = await prisma.$transaction(async (tx): Promise<ActionResult<null>> => {
      const template = await tx.checklist_templates.findFirst({
        where: withCompany({ id: templateId }, companyId),
        select: { _count: { select: { checklist_answers: true } } },
      });
      if (!template) return fail('No se encontró la plantilla');
      if (template._count.checklist_answers > 0) {
        return fail('La plantilla ya tiene respuestas: no se puede eliminar. Podés desactivarla.');
      }
      await tx.checklist_templates.deleteMany({ where: withCompany({ id: templateId }, companyId) });
      return ok(null);
    });

    if (result.ok) revalidateForms();
    return result;
  } catch (error) {
    return toFailure(error, 'No se pudo eliminar la plantilla', { templateId });
  }
}
