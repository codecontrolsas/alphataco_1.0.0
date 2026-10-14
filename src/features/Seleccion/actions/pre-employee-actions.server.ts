'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type {
  document_type_enum,
  gender_enum,
  level_of_education_enum,
  marital_status_enum,
  nationality_enum,
} from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionUserId } from '@/shared/lib/session';
import { callScalar } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { cache } from 'react';
import { z } from 'zod';
import { assertWorkCatalogsOwned } from '../lib/catalog-ownership.server';
import { DUPLICATE_IDENTITY_MESSAGE, employeeIdentityExists } from '../lib/pre-employee-identity.server';
import { assertTransition, type PreEmployeeTransitionAction } from '../lib/state-machine';
import {
  preEmployeeFormSchema,
  rejectPreEmployeeSchema,
  type PreEmployeeFormData,
} from '../schemas/pre-employee-schema';

const logger = new Logger('features/PreLegajos');

// La lista de candidatos vive en /dashboard/recruitment (la ruta vieja de empleados no la renderiza)
const PRE_LEGAJOS_ROUTE = '/dashboard/recruitment';
const PRE_LEGAJO_DETAIL_ROUTE = '/dashboard/recruitment/detail';

/**
 * Valida el payload en el SERVIDOR (la action se puede invocar directamente con cualquier objeto) y devuelve
 * solo los campos del formulario. Un cliente manipulado no puede colar `company_id`, `status`, `employee_id`,
 * `reviewed_by`, etc.: el schema los descarta y `toPrismaData` arma el `data` campo por campo.
 */
function parsePreEmployeeInput(input: unknown): PreEmployeeFormData {
  const parsed = preEmployeeFormSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Los datos del candidato no son válidos');
  }
  return parsed.data;
}

/** Convierte el payload ya validado al shape que espera Prisma, con campos EXPLÍCITOS (nunca un spread). */
function toPrismaData(data: PreEmployeeFormData) {
  return {
    firstname: data.firstname,
    lastname: data.lastname,
    cuil: data.cuil,
    document_number: data.document_number,
    born_date: data.born_date,
    birthplace: data.birthplace,
    // `undefined` = no tocar la foto guardada; `''` = quitarla.
    picture: data.picture === '' ? null : data.picture,
    street: data.street,
    street_number: data.street_number,
    postal_code: data.postal_code,
    phone: data.phone,
    email: data.email,
    province: BigInt(data.province),
    city: data.city != null ? BigInt(data.city) : null,
    // El formulario maneja los enums como string
    nationality: data.nationality as nationality_enum,
    document_type: data.document_type as document_type_enum,
    gender: data.gender as gender_enum,
    marital_status: data.marital_status as marital_status_enum,
    level_of_education: data.level_of_education as level_of_education_enum,
    // Las FK opcionales nunca viajan como string vacío a una columna uuid
    proposed_hierarchical_position: data.proposed_hierarchical_position || null,
    proposed_company_position: data.proposed_company_position || null,
  };
}

/** Sector y puesto propuestos deben ser de la empresa activa. */
async function assertProposedCatalogsOwned(data: PreEmployeeFormData, companyId: string) {
  await assertWorkCatalogsOwned(prisma, companyId, {
    hierarchical_position: data.proposed_hierarchical_position,
    company_position: data.proposed_company_position,
  });
}

// ─── Lecturas ─────────────────────────────────────────────────────────────────

/**
 * Obtiene un candidato por ID con las relaciones necesarias para el detalle.
 * Wrapped con React.cache() para deduplicar llamadas dentro del mismo request.
 */
export const getPreEmployeeByIdCached = cache(async (preEmployeeId: string) => {
  logger.debug('Obteniendo candidato por ID', { data: { preEmployeeId } });

  // Sin permiso devuelve null (no lanza): `generateMetadata` de la page lo lee antes del gate de la page.
  if (!(await checkPermissionServer('seleccion', 'candidatos', 'view'))) return null;

  const companyId = await getActiveCompanyId();

  try {
    // Perímetro sin RLS: sólo candidatos de la empresa activa
    return await prisma.pre_employees.findFirst({
      where: withCompany({ id: preEmployeeId }, companyId),
      select: {
        id: true,
        pre_file_number: true,
        status: true,
        firstname: true,
        lastname: true,
        cuil: true,
        document_type: true,
        document_number: true,
        born_date: true,
        nationality: true,
        birthplace: true,
        gender: true,
        marital_status: true,
        level_of_education: true,
        picture: true,
        street: true,
        street_number: true,
        province: true,
        city: true,
        postal_code: true,
        phone: true,
        email: true,
        proposed_hierarchical_position: true,
        proposed_company_position: true,
        rejection_reason: true,
        reviewed_at: true,
        employee_id: true,
        created_at: true,
        hierarchy: { select: { id: true, name: true } },
        company_positions: { select: { id: true, name: true } },
        countries: { select: { id: true, name: true } },
        provinces: { select: { id: true, name: true } },
        cities: { select: { id: true, name: true } },
        reviewed_by_profile: { select: { id: true, fullname: true } },
        created_by_profile: { select: { id: true, fullname: true } },
        employees: { select: { id: true, file: true } },
      },
    });
  } catch (error) {
    logger.error('Error al obtener el candidato', { data: { error, preEmployeeId } });
    throw error;
  }
});

export type PreEmployeeDetailData = NonNullable<Awaited<ReturnType<typeof getPreEmployeeByIdCached>>>;

// ─── Mutaciones ───────────────────────────────────────────────────────────────

/** Crea un candidato. Los datos personales y de contacto llegan completos (ticket 505). */
export async function createPreEmployee(input: PreEmployeeFormData) {
  logger.debug('Creando candidato');

  // La UI oculta el botón, pero la barrera es esta: la action se puede invocar directamente.
  if (!(await checkPermissionServer('seleccion', 'candidatos', 'create'))) {
    throw new Error('No tenés permiso para crear candidatos');
  }

  const data = parsePreEmployeeInput(input);
  const [companyId, profile] = await Promise.all([getActiveCompanyId(), requireServerAuthProfile()]);

  await assertProposedCatalogsOwned(data, companyId);

  if (await employeeIdentityExists(data.document_number, data.cuil)) {
    throw new Error(DUPLICATE_IDENTITY_MESSAGE);
  }

  try {
    // El numero se toma y se usa dentro de la misma transaccion: el advisory lock de
    // next_pre_file_number solo cubre a los concurrentes mientras esta abierta.
    const actor = await getSessionUserId();
    if (!actor) throw new Error('Sesión requerida');
    const created = await withActor(actor, async (tx) => {
      const preFileNumber = await callScalar('next_pre_file_number', [{ uuid: companyId }], z.string(), tx);

      return tx.pre_employees.create({
        data: {
          ...toPrismaData(data),
          pre_file_number: preFileNumber,
          company_id: companyId,
          created_by: profile.id,
        },
        select: { id: true, pre_file_number: true },
      });
    });

    logger.info('Candidato creado', {
      data: { preEmployeeId: created.id, preFileNumber: created.pre_file_number },
    });
    revalidatePath(PRE_LEGAJOS_ROUTE);
    return created;
  } catch (error) {
    logger.error('Error al crear el candidato', { data: { error } });
    throw error;
  }
}

/** Actualiza los datos de un candidato. Solo mientras es editable (en proceso / pre ingreso). */
export async function updatePreEmployee(preEmployeeId: string, input: PreEmployeeFormData) {
  logger.debug('Actualizando candidato', { data: { preEmployeeId } });

  if (!(await checkPermissionServer('seleccion', 'candidatos', 'update'))) {
    throw new Error('No tenés permiso para editar candidatos');
  }
  const data = parsePreEmployeeInput(input);
  const companyId = await getActiveCompanyId();

  const current = await prisma.pre_employees.findFirstOrThrow({
    where: withCompany({ id: preEmployeeId }, companyId),
    select: { status: true },
  });

  if (current.status === 'legajo') {
    throw new Error('El candidato ya fue convertido en legajo y no se puede modificar');
  }

  if (current.status === 'rechazado') {
    throw new Error('El candidato está rechazado: hay que reabrirlo antes de poder editarlo');
  }

  await assertProposedCatalogsOwned(data, companyId);

  if (await employeeIdentityExists(data.document_number, data.cuil)) {
    throw new Error(DUPLICATE_IDENTITY_MESSAGE);
  }

  try {
    // El estado leído va en el `where`: si otro usuario lo cambió (rechazo, aprobación) entre la lectura y
    // este update, no afecta filas en vez de pisar un candidato que ya no es editable.
    const result = await prisma.pre_employees.updateMany({
      where: { id: preEmployeeId, company_id: companyId, status: current.status },
      data: toPrismaData(data),
    });
    if (result.count === 0) {
      throw new Error('El candidato cambió de estado mientras se editaba. Recargá la página e intentá de nuevo');
    }
    const updated = { id: preEmployeeId };

    logger.info('Candidato actualizado', { data: { preEmployeeId } });
    revalidatePath(PRE_LEGAJOS_ROUTE);
    revalidatePath(PRE_LEGAJO_DETAIL_ROUTE);
    return updated;
  } catch (error) {
    logger.error('Error al actualizar el candidato', { data: { error, preEmployeeId } });
    throw error;
  }
}

/**
 * Aplica una transicion de estado validandola contra la maquina de estados y los permisos.
 * `approve` no pasa por aca: vive en approve-pre-employee.server.ts porque ademas
 * materializa el empleado.
 */
async function applyTransition(
  preEmployeeId: string,
  action: Exclude<PreEmployeeTransitionAction, 'approve'>,
  reason?: string
) {
  const companyId = await getActiveCompanyId();
  const current = await prisma.pre_employees.findFirstOrThrow({
    where: withCompany({ id: preEmployeeId }, companyId),
    select: { status: true },
  });

  const transition = assertTransition(current.status, action);

  const hasPermission = await checkPermissionServer('seleccion', 'candidatos', transition.requiredPermissionAction);
  if (!hasPermission) {
    throw new Error(`No tenés permiso para ${transition.label.toLowerCase()}`);
  }

  const profile = await requireServerAuthProfile();

  let rejectionReason: string | null = null;
  if (transition.requiresReason) {
    rejectionReason = rejectPreEmployeeSchema.parse({ rejection_reason: reason }).rejection_reason;
  }

  // El estado leído va en el `where` (lock optimista): si cambió en el medio, no se aplica la transición.
  const result = await prisma.pre_employees.updateMany({
    where: { id: preEmployeeId, company_id: companyId, status: current.status },
    data: {
      status: transition.to,
      // El motivo se limpia al reabrir: solo se conserva el del rechazo vigente
      rejection_reason: transition.requiresReason ? rejectionReason : null,
      reviewed_by: transition.requiredPermissionAction === 'approve' ? profile.id : undefined,
      reviewed_at: transition.requiredPermissionAction === 'approve' ? new Date() : undefined,
    },
  });
  if (result.count === 0) {
    throw new Error('El candidato ya fue modificado por otro usuario. Recargá la página e intentá de nuevo');
  }
  const updated = { id: preEmployeeId, status: transition.to };

  logger.info('Transición aplicada al candidato', {
    data: { preEmployeeId, from: current.status, to: transition.to },
  });

  revalidatePath(PRE_LEGAJOS_ROUTE);
  revalidatePath(PRE_LEGAJO_DETAIL_ROUTE);
  return updated;
}

/** en proceso -> pre ingreso (documentacion lista, pasa a decision de gerencia). */
export async function submitPreEmployee(preEmployeeId: string) {
  return applyTransition(preEmployeeId, 'submit');
}

/** en proceso | pre ingreso -> rechazado. El motivo es obligatorio. */
export async function rejectPreEmployee(preEmployeeId: string, reason: string) {
  return applyTransition(preEmployeeId, 'reject', reason);
}

/** rechazado -> en proceso (para poder reingresar al postulante). */
export async function reopenPreEmployee(preEmployeeId: string) {
  return applyTransition(preEmployeeId, 'reopen');
}
