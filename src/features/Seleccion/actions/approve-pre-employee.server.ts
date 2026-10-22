'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { prisma } from '@/shared/lib/prisma';
import { revalidatePath } from 'next/cache';
import { typeAppliesTo } from '@/features/Documentacion/shared/compliance/applicability';
import { loadComplianceDataset } from '@/features/Documentacion/shared/compliance/server/dataset.server';
import { refreshResourceStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { Prisma } from '@/generated/prisma/client';
import { createEmployeeCore } from '@/features/Employees/EmpleadoID/lib/create-employee-core';
import {
  employeeFormSchema,
  employeeWorkDataSchema,
  type EmployeeWorkDataValues,
} from '@/features/Employees/EmpleadoID/schemas/employee-schema';
import { assertWorkCatalogsOwned } from '../lib/catalog-ownership.server';
import { DUPLICATE_IDENTITY_MESSAGE, employeeIdentityExists } from '../lib/pre-employee-identity.server';
import { assertTransition } from '../lib/state-machine';

const logger = new Logger('features/PreLegajos/approve');

export interface ApprovePreEmployeeResult {
  employeeId: string;
  /** Documentos del checklist que se incorporaron al legajo. */
  transferredDocuments: number;
  /** Documentos que el empleado final no requiere: quedan solo en el historial del candidato. */
  skippedDocuments: number;
  /** `true` si la foto del candidato no se copió al legajo (formato inválido o demasiado pesada). */
  skippedPicture: boolean;
}

/** Tope más laxo que el de fotos nuevas: la foto ya guardada del candidato no debe bloquear la aprobación. */
const MAX_EXISTING_PICTURE_LENGTH = 3_000_000;
const IMAGE_DATA_URL_PREFIX = /^data:image\/(png|jpeg|webp);base64,/;

/** La foto ya guardada se copia solo si es una data URL de imagen de tamaño razonable. */
function isCopyablePicture(picture: string | null): picture is string {
  return Boolean(picture) && picture!.length < MAX_EXISTING_PICTURE_LENGTH && IMAGE_DATA_URL_PREFIX.test(picture!);
}

/**
 * Convierte un candidato en un legajo de empleado (ticket 505).
 *
 * Los datos personales y de contacto salen del candidato; los laborales, del formulario
 * de aprobacion (legajo definitivo, diagrama, convenio, etc.). El empleado se crea con
 * `createEmployeeCore`, el mismo camino que el alta normal, asi que el motor de alertas
 * calcula su status con el motor documental.
 *
 * Los documentos ya cargados en el candidato se crean como filas `presentado` en el legajo SOLO
 * si el tipo le aplica al empleado final. Si NO lo requiere (sus `conditions` no aplican a la
 * funcion asignada), NO se fuerza dentro del legajo: queda en el historial del candidato y se
 * informa en `skippedDocuments`.
 */
export async function approvePreEmployee(
  preEmployeeId: string,
  workDataInput: EmployeeWorkDataValues
): Promise<ApprovePreEmployeeResult> {
  logger.debug('Aprobando candidato', { data: { preEmployeeId } });

  const hasPermission = await checkPermissionServer('seleccion', 'candidatos', 'approve');
  if (!hasPermission) throw new Error('No tenés permiso para aprobar candidatos');

  const [profile, companyId, actor] = await Promise.all([
    requireServerAuthProfile(),
    getActiveCompanyId(),
    getSessionUserId(),
  ]);
  if (!actor) throw new Error('Sesión requerida');

  // Perímetro sin RLS: sólo se aprueban candidatos de la empresa activa
  const preEmployee = await prisma.pre_employees.findFirstOrThrow({
    where: withCompany({ id: preEmployeeId }, companyId),
    include: {
      documents_pre_employees: {
        select: { id: true, document_type_id: true, document_path: true, validity: true, user_id: true },
      },
    },
  });

  // Los datos laborales llegan del cliente: se parsean con SU schema (descarta claves ajenas) y sus ids de
  // catálogo deben ser de la empresa activa.
  const workDataParsed = employeeWorkDataSchema.safeParse(workDataInput);
  if (!workDataParsed.success) {
    throw new Error(workDataParsed.error.issues[0]?.message ?? 'Los datos laborales no son válidos');
  }
  const workData = workDataParsed.data;
  await assertWorkCatalogsOwned(prisma, companyId, workData);

  // Valida contra la maquina de estados: solo se aprueba desde "pre ingreso"
  assertTransition(preEmployee.status, 'approve');

  // Los datos personales y de contacto del candidato + los laborales del formulario de
  // aprobacion tienen que formar un legajo valido. Si falta algo, Zod lo dice con precision.
  const employeeParsed = employeeFormSchema.safeParse({
    // Los datos laborales van PRIMERO: nunca pueden pisar los personales/contacto del candidato
    ...workData,
    firstname: preEmployee.firstname,
    lastname: preEmployee.lastname,
    nationality: preEmployee.nationality ?? '',
    born_date: preEmployee.born_date ?? '',
    cuil: preEmployee.cuil,
    document_type: preEmployee.document_type ?? '',
    document_number: preEmployee.document_number,
    birthplace: preEmployee.birthplace,
    gender: preEmployee.gender ?? '',
    marital_status: preEmployee.marital_status ?? '',
    level_of_education: preEmployee.level_of_education ?? '',
    // La foto ya guardada se valida aparte (más laxa): no puede bloquear la aprobación.
    picture: undefined,
    street: preEmployee.street,
    street_number: preEmployee.street_number,
    province: Number(preEmployee.province),
    city: preEmployee.city != null ? Number(preEmployee.city) : undefined,
    postal_code: preEmployee.postal_code ?? '',
    phone: preEmployee.phone,
    email: preEmployee.email ?? '',
  });
  if (!employeeParsed.success) {
    throw new Error(employeeParsed.error.issues[0]?.message ?? 'Los datos del candidato no forman un legajo válido.');
  }
  const copyPicture = isCopyablePicture(preEmployee.picture);
  const skippedPicture = Boolean(preEmployee.picture) && !copyPicture;
  const employeeData = { ...employeeParsed.data, picture: copyPicture ? preEmployee.picture! : undefined };

  try {
    // withActor: createEmployeeCore dispara controlar_alertas_* (lee app.user_id)
    const result = await withActor(actor, async (tx) => {
      // Lock optimista: si otro usuario lo aprobo o lo rechazo mientras tanto, no afecta filas
      const claimed = await tx.pre_employees.updateMany({
        where: { id: preEmployeeId, company_id: companyId, status: 'pre_ingreso', employee_id: null },
        data: { status: 'legajo' },
      });

      if (claimed.count === 0) {
        throw new Error('El candidato ya fue procesado por otro usuario');
      }

      // Revalidacion de duplicados DENTRO de la transaccion (pudo pasar tiempo desde que se cargo el candidato
      // y `employees.cuil` / `employees.document_number` son unique). Mensaje generico: no revela el otro registro.
      if (await employeeIdentityExists(employeeData.document_number, employeeData.cuil, tx)) {
        throw new Error(DUPLICATE_IDENTITY_MESSAGE);
      }

      // Mismo camino que el alta normal de empleado: crea escalares + M:M y recalcula
      // los documentos que le corresponden segun sus conditions
      const employee = await createEmployeeCore(tx, employeeData, companyId);

      // Transferencia de los documentos ya cargados en el candidato
      let transferredDocuments = 0;
      let skippedDocuments = 0;

      // Modelo derivado: no hay filas pendientes que actualizar. Se crea una fila `presentado` por cada
      // documento del candidato cuyo tipo le aplica al empleado final según el motor.
      const dataset = await loadComplianceDataset(tx, {
        companyId,
        kind: 'Persona',
        resourceIds: [employee.id],
      });
      const resource = dataset.resources.find((r) => r.id === employee.id);
      const applicableTypeIds = new Set(
        resource ? dataset.types.filter((type) => typeAppliesTo(type, resource)).map((type) => type.id) : []
      );

      const toCreate: Prisma.documents_employeesCreateManyInput[] = [];
      const seenTypes = new Set<string>();
      for (const document of preEmployee.documents_pre_employees) {
        const typeId = document.document_type_id;
        if (
          !typeId ||
          !document.document_path ||
          !applicableTypeIds.has(typeId) ||
          seenTypes.has(typeId)
        ) {
          // El empleado final no requiere este tipo (o el registro no tiene archivo): no se fuerza dentro
          // del legajo. El archivo sigue accesible desde el historial del candidato.
          skippedDocuments += 1;
          continue;
        }
        seenTypes.add(typeId);
        toCreate.push({
          applies: employee.id,
          id_document_types: typeId,
          document_path: document.document_path,
          state: 'presentado',
          validity: document.validity,
          user_id: document.user_id,
        });
      }
      if (toCreate.length > 0) {
        await tx.documents_employees.createMany({ data: toCreate });
        transferredDocuments = toCreate.length;
      }

      // Los documentos se transfieren DESPUES del alta: el status cacheado que dejo createEmployeeCore
      // quedo viejo. Se refresca al final de las escrituras de documentos para que este valor sea el que queda.
      await refreshResourceStatus(tx, 'Persona', companyId, employee.id);

      await tx.pre_employees.update({
        where: { id: preEmployeeId, company_id: companyId },
        data: {
          employee_id: employee.id,
          reviewed_by: profile.id,
          reviewed_at: new Date(),
          rejection_reason: null,
        },
      });

      return { employeeId: employee.id, transferredDocuments, skippedDocuments, skippedPicture };
    });

    logger.info('Candidato convertido en legajo', { data: { preEmployeeId, ...result } });

    revalidatePath('/dashboard/employee');
    revalidatePath('/dashboard/recruitment');
    revalidatePath('/dashboard/recruitment/detail');

    return result;
  } catch (error) {
    logger.error('Error al aprobar el candidato', { data: { error, preEmployeeId } });
    // Carrera con otra alta: el unique de DNI/CUIL/legajo salta en el insert aunque el chequeo previo pasara
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('Ya existe un empleado con ese DNI, CUIL o legajo. Revisá los datos e intentá de nuevo');
    }
    throw error;
  }
}
