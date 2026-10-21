'use server';

import { requireFormsPermission } from '@/features/Formularios/lib/access.server';
import { Logger } from '@/lib/logger';
import { getActualRole } from '@/shared/actions/shared-users.server';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Formularios/actions');

const customFormSelect = { id: true, created_at: true, company_id: true, form: true, name: true } as const;

/** Formulario personalizado (estructura legacy `custom_form`) de la empresa activa. */
export const fetchCustomFormById = async (formId: string) => {
  await requireFormsPermission('view');
  try {
    const company_id = await getActiveCompanyId();
    return await prisma.custom_form.findMany({
      where: withCompany({ id: formId }, company_id),
      select: customFormSelect,
    });
  } catch (error) {
    logger.error('Error al obtener el formulario personalizado', { data: { error, formId } });
    return [];
  }
};

export type CustomFormRow = Awaited<ReturnType<typeof fetchCustomFormById>>[number];

const formAnswerSelect = {
  id: true,
  created_at: true,
  answer: true,
  custom_form: { select: customFormSelect },
} as const;

type CustomFormRowShape = {
  id: string;
  created_at: Date;
  company_id: string;
  form: unknown;
  name: string;
};

/** Alias legacy `form_id` con el formulario expandido (shape del select `*,form_id(*)`). */
function toFormAnswer<T extends { custom_form: CustomFormRowShape }>({ custom_form, ...rest }: T) {
  return { ...rest, form_id: custom_form };
}

/**
 * Respuestas de un formulario personalizado.
 *
 * Los usuarios con rol `Invitado` sólo ven las respuestas de los equipos afectados a sus
 * clientes (`share_company_users → customers → contractor_equipment`); el resto ve todas
 * las del formulario. El formulario se acota siempre a la empresa activa.
 */
export const fetchFormsAnswersByFormId = async (formId: string) => {
  await requireFormsPermission('view');
  try {
    const company_id = await getActiveCompanyId();
    const credentialId = await getSessionUserId();

    const form = await prisma.custom_form.findFirst({
      where: withCompany({ id: formId }, company_id),
      select: { id: true },
    });
    if (!form) return [];

    const role = await getActualRole(company_id);

    if (role === 'Invitado' && credentialId) {
      // `share_company_users.profile_id` es `profile.id`, no el id de credencial de la sesión.
      const memberships = await prisma.share_company_users.findMany({
        where: { company_id, profile: { credential_id: credentialId } },
        select: {
          customers: {
            select: { contractor_equipment: { select: { equipment_id: true } } },
          },
        },
      });

      const equipmentIds = memberships.flatMap(
        (membership) =>
          membership.customers?.contractor_equipment
            .map((relation) => relation.equipment_id)
            .filter((id): id is string => Boolean(id)) ?? []
      );

      if (equipmentIds.length === 0) return [];

      const answers = await prisma.form_answers.findMany({
        where: { form_id: formId },
        select: formAnswerSelect,
        orderBy: { created_at: 'desc' },
      });

      // `answer->>movil` no es una columna: el filtro por equipo se resuelve sobre el JSON.
      const allowed = new Set(equipmentIds);
      return answers
        .filter((answer) => {
          const movil = (answer.answer as Record<string, unknown> | null)?.movil;
          return typeof movil === 'string' && allowed.has(movil);
        })
        .map(toFormAnswer);
    }

    const answers = await prisma.form_answers.findMany({
      where: { form_id: formId },
      select: formAnswerSelect,
      orderBy: { created_at: 'desc' },
    });
    return answers.map(toFormAnswer);
  } catch (error) {
    logger.error('Error al obtener las respuestas del formulario', { data: { error, formId } });
    return [];
  }
};

export type FormAnswerRow = Awaited<ReturnType<typeof fetchFormsAnswersByFormId>>[number];

/** Respuesta de formulario personalizado por id, con su formulario (empresa activa). */
export const fetchAnswerById = async (answerId: string) => {
  await requireFormsPermission('view');
  try {
    const company_id = await getActiveCompanyId();
    const answers = await prisma.form_answers.findMany({
      where: { id: answerId, custom_form: withCompany({}, company_id) },
      select: {
        id: true,
        created_at: true,
        answer: true,
        custom_form: { select: customFormSelect },
      },
      orderBy: { created_at: 'desc' },
    });

    // Alias `form_id` expandido, como lo devolvía el select legacy `*,form_id(*)`.
    return answers.map(toFormAnswer);
  } catch (error) {
    logger.error('Error al obtener la respuesta del formulario', { data: { error, answerId } });
    return [];
  }
};

export type FormAnswerDetail = Awaited<ReturnType<typeof fetchAnswerById>>[number];

const equipmentOptionSelect = {
  id: true,
  domain: true,
  serie: true,
  intern_number: true,
  kilometer: true,
  engine_hours: true,
  brand_vehicles: { select: { name: true } },
  model_vehicles: { select: { name: true } },
  type_vehicles_typeTotype: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
} as const;

/**
 * Equipos puntuales (empresa activa) para mostrar una respuesta en solo lectura: el equipo de la
 * respuesta y su enganche, en vez de traer toda la flota. Shape de `mapEquipmentToChecklistFormat`.
 */
export const fetchEquipmentsByIdsForChecklist = async (equipmentIds: string[]) => {
  await requireFormsPermission('view');
  const ids = [...new Set(equipmentIds.filter(Boolean))];
  if (ids.length === 0) return [];

  try {
    const company_id = await getActiveCompanyId();
    const rows = await prisma.vehicles.findMany({
      where: withCompany({ id: { in: ids } }, company_id),
      select: equipmentOptionSelect,
    });

    return rows.map(({ brand_vehicles, model_vehicles, type_vehicles_typeTotype, sub_type, ...rest }) => ({
      ...rest,
      brand: brand_vehicles,
      model: model_vehicles,
      type: type_vehicles_typeTotype,
      subType: sub_type,
    }));
  } catch (error) {
    logger.error('Error al obtener los equipos de la respuesta', { data: { error, equipmentIds: ids } });
    return [];
  }
};

/**
 * Profile del usuario de sesión (array de 0/1 elementos, shape legacy de `select('*')`).
 *
 * Se resuelve por `credential_id`: `profile.id` es el UUID interno y NO coincide con el id
 * del usuario de sesión, así que la consulta legacy por `id` devolvía vacío.
 */
export const getCurrentProfile = async () => {
  try {
    const credentialId = await getSessionUserId();
    if (!credentialId) return [];

    return await prisma.profile.findMany({
      where: { credential_id: credentialId },
      select: {
        id: true,
        credential_id: true,
        created_at: true,
        email: true,
        avatar: true,
        fullname: true,
        role: true,
        employee_id: true,
      },
    });
  } catch (error) {
    logger.error('Error al obtener el profile del usuario', { data: { error } });
    return [];
  }
};

export type CurrentProfile = Awaited<ReturnType<typeof getCurrentProfile>>[number];

/**
 * Formularios personalizados de la empresa activa con la cantidad de respuestas de cada uno
 * (reemplaza el `select('*,form_answers(form_id)')` legacy, que traía una fila por respuesta
 * sólo para contarlas).
 */
export const fetchCustomFormsWithAnswerCount = async () => {
  await requireFormsPermission('view');
  try {
    const company_id = await getActiveCompanyId();
    const forms = await prisma.custom_form.findMany({
      where: withCompany({}, company_id),
      select: { ...customFormSelect, _count: { select: { form_answers: true } } },
      orderBy: { created_at: 'desc' },
    });

    return forms.map(({ _count, ...form }) => ({ ...form, answersCount: _count.form_answers }));
  } catch (error) {
    logger.error('Error al obtener los formularios personalizados', { data: { error } });
    return [];
  }
};

export type CustomFormWithAnswerCount = Awaited<ReturnType<typeof fetchCustomFormsWithAnswerCount>>[number];
