'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { contactSchema } from '@/shared/schemas/schemas';
import { revalidatePath } from 'next/cache';
import { requireComercialPermission } from '../../Clientes/lib/require-permission.server';

/**
 * Contactos de la EMPRESA activa (`contacts.company_id`), asociados a un cliente de la misma
 * empresa. Acá está el detalle y el alta/edición del formulario `ContactComponent`.
 *
 * Perímetro sin RLS: `company_id` sale SIEMPRE de la sesión (el `company_id` del FormData se
 * ignora), la fila se busca por `{ id, company_id }` y el cliente tiene que ser de la empresa.
 * El shape `{ status, body }` lo consume `ContactComponent` (su único llamador desde que la
 * Task 7 borró `CCT/CovenantComponent`, que lo usaba por error para guardar convenios).
 */
const logger = new Logger('features/Empresa/Contactos');

const COMPANY_PATH = '/dashboard/configuration';

export type ContactMutationResult = { status: 200 | 201 | 400 | 403 | 404 | 500; body: string };

/** Contacto de la empresa activa por id (bigint del teléfono → string), o null. */
export async function getContactById(contactId: string) {
  await requireCustomersView();
  const companyId = await getActiveCompanyId();
  try {
    const row = await prisma.contacts.findFirst({ where: withCompany({ id: contactId }, companyId) });
    if (!row) return null;
    const { contact_phone, ...rest } = row;
    return { ...rest, contact_phone: contact_phone === null ? null : contact_phone.toString() };
  } catch (error) {
    logger.error('Error al obtener contacto', { data: { error, contactId, companyId } });
    throw error;
  }
}

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContactById>>>;

/** Clientes activos de la empresa activa para el selector del formulario. */
export async function getActiveCustomerOptions() {
  await requireCustomersView();
  const companyId = await getActiveCompanyId();
  try {
    return await prisma.customers.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener clientes para contactos', { data: { error, companyId } });
    throw error;
  }
}

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value ? value : undefined;
}

type ParsedContact =
  | {
      ok: true;
      data: {
        contact_name: string;
        constact_email: string | null;
        contact_phone: bigint;
        contact_charge: string;
        customer_id: string;
      };
    }
  | { ok: false; error: string };

/** Valida el FormData con el mismo `contactSchema` del formulario; el teléfono va a bigint. */
function parseContactForm(formData: FormData): ParsedContact {
  const parsed = contactSchema.safeParse({
    contact_name: formString(formData, 'contact_name'),
    contact_phone: formString(formData, 'contact_phone'),
    contact_email: formString(formData, 'contact_email'),
    contact_charge: formString(formData, 'contact_charge'),
    customer: formString(formData, 'customer'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const { contact_name, contact_phone, contact_email, contact_charge, customer } = parsed.data;
  if (!customer || customer === 'undefined') return { ok: false, error: 'Debe seleccionar un cliente válido.' };
  const digits = contact_phone.replace(/\D/g, '');
  if (!digits) return { ok: false, error: 'El teléfono debe contener números.' };
  return {
    ok: true,
    data: {
      contact_name: contact_name.trim(),
      constact_email: contact_email?.trim() || null,
      contact_phone: BigInt(digits),
      contact_charge: contact_charge.trim(),
      customer_id: customer,
    },
  };
}

/**
 * Lecturas del formulario de contacto: mismo permiso que sus mutaciones (Comercial → Clientes). Sin permiso
 * lanza: un `null`/`[]` se leería como "contacto no encontrado" o "no hay clientes".
 */
async function requireCustomersView(): Promise<void> {
  const denied = await requireComercialPermission('customers', 'view');
  if (denied) throw new Error(denied);
}

async function assertCustomerInCompany(customerId: string, companyId: string): Promise<boolean> {
  const customer = await prisma.customers.findFirst({
    where: withCompany({ id: customerId }, companyId),
    select: { id: true },
  });
  return customer !== null;
}

/** Alta de contacto. Rechaza el duplicado exacto (mismos datos, mismo cliente) dentro de la empresa. */
export async function createdContact(formData: FormData): Promise<ContactMutationResult> {
  const denied = await requireComercialPermission('customers', 'create');
  if (denied) return { status: 403, body: denied };
  const parsed = parseContactForm(formData);
  if (!parsed.ok) return { status: 400, body: parsed.error };

  try {
    const companyId = await getActiveCompanyId();
    if (!(await assertCustomerInCompany(parsed.data.customer_id, companyId))) {
      return { status: 400, body: 'El cliente no pertenece a la empresa activa' };
    }

    const existing = await prisma.contacts.findFirst({
      where: withCompany({ ...parsed.data }, companyId),
      select: { id: true },
    });
    if (existing) return { status: 400, body: 'El contacto ya existe en esta empresa' };

    await prisma.contacts.create({ data: { ...parsed.data, } });
    revalidatePath(COMPANY_PATH);
    logger.info('Contacto creado', { data: { companyId, customerId: parsed.data.customer_id } });
    return { status: 201, body: 'Contacto creado satisfactoriamente.' };
  } catch (error) {
    logger.error('Error al crear contacto', { data: { error } });
    return { status: 500, body: 'No se pudo crear el contacto' };
  }
}

/** Edición de contacto (`id` en el FormData), acotada a la empresa activa. */
export async function updateContact(formData: FormData): Promise<ContactMutationResult> {
  const denied = await requireComercialPermission('customers', 'create');
  if (denied) return { status: 403, body: denied };
  const id = formString(formData, 'id');
  if (!id) return { status: 400, body: 'Falta el contacto a editar' };
  const parsed = parseContactForm(formData);
  if (!parsed.ok) return { status: 400, body: parsed.error };

  try {
    const companyId = await getActiveCompanyId();
    if (!(await assertCustomerInCompany(parsed.data.customer_id, companyId))) {
      return { status: 400, body: 'El cliente no pertenece a la empresa activa' };
    }

    const updated = await prisma.contacts.updateMany({ where: withCompany({ id }, companyId), data: parsed.data });
    if (updated.count === 0) return { status: 404, body: 'Contacto no encontrado en la empresa activa' };

    revalidatePath(COMPANY_PATH);
    logger.info('Contacto actualizado', { data: { companyId, contactId: id } });
    return { status: 200, body: 'Contacto actualizado satisfactoriamente' };
  } catch (error) {
    logger.error('Error al actualizar contacto', { data: { error, contactId: id } });
    return { status: 500, body: 'No se pudo actualizar el contacto' };
  }
}
