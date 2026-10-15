'use server';

import { resolveChecklistEmployeeId } from '@/features/Checklists/lib/checklist-attribution';
import {
  NUEVO_PEDIDO_CREATE,
  NUEVO_PEDIDO_VIEW,
  requireResourceAccess,
  type ResourcePermission,
} from '@/features/Mantenimiento/shared/resource-access.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { CACHE_TAGS } from '@/shared/constants/cache';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { getSessionEmployeeIdClaim } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { cookies } from 'next/headers';

const serverLogger = new Logger('Checklists/actions');

const FORMULARIOS_VIEW: ResourcePermission = { module: 'formularios', tab: 'formularios', action: 'view' };
const FORMULARIOS_CREATE: ResourcePermission = { module: 'formularios', tab: 'formularios', action: 'create' };

/**
 * Crea una nueva respuesta de checklist normalizado
 *
 * NUEVO FLUJO:
 * - Ya NO actualiza vehicles.condition a 'no operativo' directamente
 * - Ya NO actualiza vehicles.kilometer directamente
 * - En su lugar, crea una maintenance_request que debe ser aprobada
 * - El kilometraje y condición se actualizan cuando se aprueba la entrada a taller
 */
type FailedChecklistItem = {
  item_code: string;
  item_label: string;
  section_code: string;
  is_critical: boolean;
  driver_comment?: string;
};

type ChecklistAnswerInput = {
  equipment_id: string;
  customer_id?: string | null;
  employee_id?: string | null;
  // ID del empleado seleccionado como chofer — columna FK directa en checklist_answers
  chofer_employee_id?: string | null;
  chofer?: string;
  fecha?: string;
  hora?: string;
  kilometraje?: string;
  horometro?: string;
  observaciones?: string;
  answers?: Record<string, Record<string, unknown>>;
  /**
   * Observaciones libres por item (columna OBSERVACIONES de los formularios en
   * papel), indexadas por `seccion__item`.
   *
   * Va aparte de `answers` a propósito: el cálculo del resultado recorre ese
   * subárbol buscando el literal "M", y una observación que dijera "M" marcaría
   * el checklist entero como fallido.
   */
  item_observations?: Record<string, string>;
  failed_items?: Array<FailedChecklistItem | string>;
  critical_items_failed?: Array<FailedChecklistItem | string>;
  ut_checklist_answer_id?: string | null;
};

const hasMValue = (value: unknown): boolean => {
  if (value === 'M' || value === 'Malo') return true;
  if (Array.isArray(value)) return value.some(hasMValue);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMValue);
  return false;
};

/** Sanitiza valores no serializables / sentinelas (ej: "$undefined" en payloads) */
const sanitize = (value: unknown): Prisma.InputJsonValue | null => {
  if (value === '$undefined' || value === undefined) return null;
  if (Array.isArray(value)) return value.map(sanitize) as Prisma.InputJsonValue;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)] as const);
    return Object.fromEntries(entries) as Prisma.InputJsonValue;
  }
  return value as Prisma.InputJsonValue;
};

/**
 * Empresa del checklist: SIEMPRE la del equipo, nunca la de sesión — y SÓLO si quien llama
 * prueba que pertenece a ella.
 *
 * El formulario se responde también desde el flujo QR (`/maintenance/equipment/[id]/checklists/**`),
 * donde la sesión es la del operario y no es miembro de la empresa. Por eso el perímetro es de dos
 * caminos (`requireResourceAccess`): operario del QR con legajo de la empresa del equipo, o
 * usuario del dashboard con la empresa activa y el permiso que corresponda al modo:
 * - `read` (armar el formulario): `formularios:formularios:view` o los permisos de Nuevo Pedido.
 * - `write` (guardar una respuesta): `formularios:formularios:create` o `nuevo_pedido:create`.
 */
async function getVehicleCompanyId(equipmentId: string, mode: 'read' | 'write' = 'read'): Promise<string> {
  const { companyId } = await requireResourceAccess('vehicle', equipmentId, {
    dashboardPermissions:
      mode === 'write'
        ? [FORMULARIOS_CREATE, NUEVO_PEDIDO_CREATE]
        : [FORMULARIOS_VIEW, NUEVO_PEDIDO_VIEW, NUEVO_PEDIDO_CREATE],
  });
  return companyId;
}

/** Devuelve el id sólo si el empleado existe y pertenece a la empresa del equipo. */
async function employeeIdInCompany(employeeId: string | null | undefined, companyId: string) {
  if (!employeeId) return null;
  const employee = await prisma.employees.findFirst({
    where: { id: employeeId, company_id: companyId },
    select: { id: true },
  });
  return employee?.id ?? null;
}

export const CreateChecklistAnswer = async (templateId: string, answerData: ChecklistAnswerInput) => {
  const cookiesStore = await cookies();
  const authProfile = await getServerAuthProfile();

  serverLogger.info('Creando respuesta de checklist', {
    data: { templateId, equipmentId: answerData.equipment_id },
  });

  // Sin RLS: la empresa sale del equipo y todo lo que llega del cliente se valida contra ella.
  const companyId = await getVehicleCompanyId(answerData.equipment_id, 'write');

  const template = await prisma.checklist_templates.findFirst({
    where: { id: templateId, company_id: companyId },
    select: { id: true },
  });
  if (!template) throw new Error('La plantilla de checklist no pertenece a la empresa del equipo');

  // checklist_answers.result tiene un CHECK constraint: solo permite 'B' o 'M'.
  // Calculamos el resultado global a partir de las respuestas (si existe algún 'M' => 'M', sino 'B').
  const sanitizedAnswers = sanitize(answerData.answers ?? {}) ?? {};
  // Soportar tanto el nuevo formato (failed_items) como el antiguo (critical_items_failed)
  const failedItems = answerData.failed_items || answerData.critical_items_failed || [];
  const computedResult: 'B' | 'M' = hasMValue(sanitizedAnswers) || failedItems.length > 0 ? 'M' : 'B';

  // Atribución del empleado: payload → cookie `empleado_id` (QR) → metadata de sesión.
  // La metadata es la única fuente desde `dashboard/forms/[id]/new`.
  const requestedEmployeeId = resolveChecklistEmployeeId({
    payload: answerData.employee_id,
    cookie: cookiesStore.get('empleado_id')?.value,
    metadata: await getSessionEmployeeIdClaim(),
  });
  const finalEmployeeId = await employeeIdInCompany(requestedEmployeeId, companyId);
  const choferEmployeeId = await employeeIdInCompany(answerData.chofer_employee_id, companyId);

  const customer = answerData.customer_id
    ? await prisma.customers.findFirst({
        where: { id: answerData.customer_id, company_id: companyId },
        select: { id: true },
      })
    : null;

  const answerPayload = {
    // Respuestas estructuradas por sección
    answers: sanitizedAnswers,
    // ⚠️ CRÍTICO: Las keys del JSONB 'customer_id', 'kilometraje', 'horometro' son
    // capturadas por columnas GENERATED en la tabla checklist_answers.
    // Si se renombran estas keys, actualizar también la migración de BD.
    customer_id: customer?.id ?? null,
    chofer: answerData.chofer ?? null,
    fecha: answerData.fecha ?? null,
    hora: answerData.hora ?? null,
    kilometraje: answerData.kilometraje ?? null,
    // El horómetro también alimenta una columna GENERATED; faltaba en el payload,
    // por lo que la vista de detalle lo mostraba siempre vacío.
    horometro: answerData.horometro ?? null,
    // Observaciones por item, fuera de `answers` (ver el tipo de entrada)
    item_observations: sanitize(answerData.item_observations ?? {}) ?? {},
  } satisfies Prisma.InputJsonObject;

  // Normaliza los items fallidos: el formato antiguo es un string con el label.
  const normalizedFailedItems: FailedChecklistItem[] = failedItems.map((item) =>
    typeof item === 'string'
      ? { item_code: item, item_label: item, section_code: '', is_critical: false }
      : {
          item_code: item.item_code || item.item_label || '',
          item_label: item.item_label || item.item_code || '',
          section_code: item.section_code || '',
          is_critical: item.is_critical || false,
          ...(item.driver_comment ? { driver_comment: item.driver_comment } : {}),
        }
  );

  const data = await prisma.checklist_answers.create({
    data: {
      template_id: templateId,
      equipment_id: answerData.equipment_id,
      company_id: companyId,
      employee_id: finalEmployeeId,
      user_id: authProfile?.id ?? null,
      ut_checklist_answer_id: answerData.ut_checklist_answer_id || null, // ID del checklist UT si este es de enganche
      // Columna FK directa — guarda el ID del empleado chofer para filtrado y trazabilidad
      chofer_employee_id: choferEmployeeId,
      answer_data: answerPayload,
      observations: answerData.observaciones || null,
      result: computedResult,
      // Guardar los labels de los items fallidos (columna text[])
      critical_items_failed: normalizedFailedItems.map((item) => item.item_label),
    },
    select: { id: true },
  });

  serverLogger.info('Checklist answer creado', { data: { answerId: data.id, result: computedResult } });

  // Si hay items fallidos, crear registros en checklist_deviations
  // NUEVO FLUJO: Ahora se detectan TODOS los items con valor "M", no solo los críticos
  //
  // Ticket 677: el checklist del enganche TAMBIÉN crea desvíos, con su propio
  // `equipment_id`. Antes se bloqueaban acá (`!answerData.ut_checklist_answer_id`)
  // porque el checklist del enganche era una copia entera del de la unidad tractora
  // y habría duplicado todo. Hoy el formulario le manda únicamente los ítems de la
  // sección que describe al acoplado, así que el desvío —y la solicitud de
  // mantenimiento que sale de él— quedan imputados a la patente correcta.
  if (normalizedFailedItems.length > 0) {
    try {
      await prisma.checklist_deviations.createMany({
        data: normalizedFailedItems.map((item) => ({
          checklist_answer_id: data.id,
          equipment_id: answerData.equipment_id,
          company_id: companyId,
          item_code: item.item_code,
          item_label: item.item_label,
          section_code: item.section_code || null,
          is_critical: item.is_critical,
          driver_comment: item.driver_comment ?? null,
          created_by_user_id: authProfile?.id ?? null,
          created_by_employee_id: finalEmployeeId,
        })),
      });

      serverLogger.info(`Created ${normalizedFailedItems.length} checklist deviations`, {
        data: { answerId: data.id, count: normalizedFailedItems.length },
      });

      // Los desvíos quedan registrados sin solicitud de mantenimiento.
      // El usuario debe crear la solicitud desde el modal que aparece al finalizar
      // o desde la tabla de "Equipos con Desvíos" en el módulo de Mantenimiento.
      // Por eso invalidamos su cache acá: es el único punto donde se crean desvíos
      // pendientes sin quedar linkeados a una solicitud en la misma operación.
      await invalidateCacheTags([CACHE_TAGS.TAB_EQUIPMENTS_DEVIATIONS]);
    } catch (error) {
      serverLogger.error('Error creating checklist deviations', { data: { error } });
      // No lanzamos error para no fallar el guardado del checklist, solo lo logueamos
    }
  }

  // Actualizar km del vehículo al responder el checklist (solo si es mayor al actual)
  if (answerData.kilometraje) {
    const newKm = Number(answerData.kilometraje);
    if (!isNaN(newKm) && newKm > 0) {
      try {
        const vehicle = await prisma.vehicles.findUnique({
          where: { id: answerData.equipment_id },
          select: { kilometer: true },
        });
        const currentKm = Number(vehicle?.kilometer) || 0;

        if (newKm > currentKm) {
          await prisma.vehicles.update({
            where: { id: answerData.equipment_id },
            data: { kilometer: String(newKm) },
          });
          serverLogger.info('Km del vehículo actualizado al responder checklist', {
            data: { equipmentId: answerData.equipment_id, newKm, currentKm },
          });
        }
      } catch (error) {
        serverLogger.warn('No se pudo actualizar km del vehículo al responder checklist', { data: { error } });
      }
    }
  }

  return data;
};

export type ChecklistAnswerData = Awaited<ReturnType<typeof CreateChecklistAnswer>>;

/**
 * Obtiene la lista de clientes activos para el checklist
 */
export async function fetchActiveCustomersForChecklist() {
  try {
    const company_id = await getActiveCompanyId();
    return await prisma.customers.findMany({
      where: { company_id, is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    serverLogger.error('Error fetching customers for checklist', { data: { error } });
    return [];
  }
}

export type CustomerForChecklist = Awaited<ReturnType<typeof fetchActiveCustomersForChecklist>>[number];

/**
 * Clientes activos de la empresa DEL EQUIPO, para el flujo QR anónimo
 * (`/maintenance/equipment/[id]/checklists/**`), donde no hay empresa de sesión.
 */
export async function fetchActiveCustomersForEquipment(equipmentId: string) {
  try {
    const company_id = await getVehicleCompanyId(equipmentId);
    return await prisma.customers.findMany({
      where: { company_id, is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    serverLogger.error('Error fetching customers for equipment checklist', { data: { error, equipmentId } });
    return [];
  }
}

/**
 * Obtiene la lista de empleados activos para el checklist (para el campo Chofer)
 */
export async function fetchActiveEmployeesForChecklist() {
  try {
    const company_id = await getActiveCompanyId();
    const employees = await prisma.employees.findMany({
      where: { company_id, is_active: true },
      select: { id: true, firstname: true, lastname: true, cuil: true, file: true },
      orderBy: { lastname: 'asc' },
    });

    // Formatear el nombre completo — legajo (field: file) obligatorio según estándar del proyecto
    return employees.map((emp) => ({
      id: emp.id,
      fullName: `${emp.lastname || ''} ${emp.firstname || ''}`.trim(),
      document: emp.cuil || null,
      file_number: emp.file || null,
    }));
  } catch (error) {
    serverLogger.error('Error fetching employees for checklist', { data: { error } });
    return [];
  }
}

export type EmployeeForChecklist = Awaited<ReturnType<typeof fetchActiveEmployeesForChecklist>>[number];

/**
 * Supervisores de turno de una empresa (usuarios con rol "Administrador Operaciones").
 * Son los usuarios que el chofer puede seleccionar al registrar desvíos.
 * Filtra por la compañía indicada usando share_company_users, exigiendo que la pertenencia
 * esté activa (mismo criterio que `canAccessCompany()` y `assertSupervisorInCompany()`): un
 * usuario dado de baja de la empresa no se ofrece como supervisor.
 *
 * FILTRO DE DIAGRAMA LABORALMENTE ACTIVO:
 * - Si el profile tiene employee_id → solo se incluye si tiene un registro en employees_diagram
 *   para el día actual con is_active = true Y cuyo diagram_type tenga work_active = true.
 * - Si el profile NO tiene employee_id → se incluye como no disponible (sin empleado vinculado).
 */
async function getSupervisorsForCompany(company_id: string) {
  try {
    const ADMIN_OPERACIONES_ROLE_ID = 20;

    // Paso 1: Obtener los user_ids con rol Administrador Operaciones EN esta empresa
    // (el rol es por empresa desde la Task 13a: `user_roles.company_id`).
    const adminUserRoles = await prisma.user_roles.findMany({
      where: { role_id: ADMIN_OPERACIONES_ROLE_ID, company_id },
      select: { user_id: true },
    });

    if (adminUserRoles.length === 0) {
      serverLogger.warn('No hay usuarios con rol Administrador Operaciones');
      return [];
    }

    const userIds = adminUserRoles.map((ur) => ur.user_id);

    // Paso 2: Obtener perfiles que pertenecen a la compañía actual y tienen el rol
    const profiles = await prisma.profile.findMany({
      where: {
        id: { in: userIds },
        share_company_users: {
          some: { company_id, is_active: true },
        },
      },
      select: {
        id: true,
        fullname: true,
        email: true,
        employee_id: true,
      },
    });

    if (profiles.length === 0) {
      serverLogger.warn('No hay supervisores en la compañía actual', { data: { company_id } });
      return [];
    }

    // Paso 3: Verificar diagrama laboralmente activo para hoy
    // FIX: ahora se verifica TANTO is_active del registro COMO work_active del tipo de novedad
    const employeeIds = profiles.filter((p) => p.employee_id !== null).map((p) => p.employee_id!);

    const activeEmployeeIds = new Set<string>();

    if (employeeIds.length > 0) {
      // Día argentino (el contenedor corre en UTC)
      const [todayYear, todayMonth, todayDay] = argentinaDate().split('-').map(Number);
      const today = { day: todayDay!, month: todayMonth!, year: todayYear! };

      const activeDiagrams = await prisma.employees_diagram.findMany({
        where: {
          employee_id: { in: employeeIds },
          day: today.day,
          month: today.month,
          year: today.year,
          // Solo verificar que el tipo de novedad sea laboralmente activo
          diagram_type_employees_diagram_diagram_typeTodiagram_type: {
            work_active: true,
          },
        },
        select: { employee_id: true },
      });

      activeDiagrams.forEach((d) => activeEmployeeIds.add(d.employee_id));

      serverLogger.debug('Supervisores con diagrama laboralmente activo hoy', {
        data: {
          checked: employeeIds.length,
          active: activeEmployeeIds.size,
          today,
        },
      });
    }

    // Retornar TODOS los supervisores con metadata de disponibilidad
    return profiles.map((profile) => {
      const hasLinkedEmployee = profile.employee_id !== null;
      const hasActiveDiagram = hasLinkedEmployee ? activeEmployeeIds.has(profile.employee_id!) : false;
      return {
        id: profile.id,
        fullName: profile.fullname || profile.email || 'Sin nombre',
        email: profile.email,
        hasLinkedEmployee,
        hasActiveDiagram,
        isAvailable: hasLinkedEmployee && hasActiveDiagram,
      };
    });
  } catch (error) {
    serverLogger.error('Error al obtener supervisores para checklist', { data: { error } });
    return [];
  }
}

/** Supervisores de la empresa activa (dashboard, con sesión). */
export async function fetchSupervisorsForChecklist() {
  try {
    return await getSupervisorsForCompany(await getActiveCompanyId());
  } catch (error) {
    serverLogger.error('Error al obtener supervisores de la empresa activa', { data: { error } });
    return [];
  }
}

/**
 * Supervisores de la empresa DEL EQUIPO.
 *
 * Es la variante que usa el flujo QR anónimo: ahí no hay empresa de sesión y el modal de
 * desvíos EXIGE elegir supervisor, así que resolverla por sesión dejaba la lista vacía y al
 * operario sin poder registrar el desvío. Misma regla que
 * `Mantenimiento/shared/resource-company.ts::getResourceCompanyId`.
 */
export async function fetchSupervisorsForEquipment(equipmentId: string) {
  try {
    return await getSupervisorsForCompany(await getVehicleCompanyId(equipmentId));
  } catch (error) {
    serverLogger.error('Error al obtener supervisores de la empresa del equipo', { data: { error, equipmentId } });
    return [];
  }
}

/**
 * Supervisores de la empresa del RECURSO, sea vehículo o equipamiento (ticket 596).
 *
 * Variante de `fetchSupervisorsForEquipment` para el formulario de Nuevo Pedido, que sirve
 * a los dos caminos: el del dashboard y el del QR anónimo (`/maintenance/equipment/[id]/…`).
 * `kind` es sólo el discriminador de qué tabla mirar — la empresa la sigue poniendo la fila
 * del recurso, nunca el cliente.
 */
export async function fetchSupervisorsForResource(kind: 'vehicle' | 'other_equipment', resourceId: string) {
  try {
    if (kind === 'other_equipment') {
      const { companyId } = await requireResourceAccess('other_equipment', resourceId, {
        dashboardPermissions: [NUEVO_PEDIDO_VIEW, NUEVO_PEDIDO_CREATE],
      });
      return await getSupervisorsForCompany(companyId);
    }

    return await getSupervisorsForCompany(await getVehicleCompanyId(resourceId));
  } catch (error) {
    serverLogger.error('Error al obtener supervisores de la empresa del recurso', {
      data: { error, kind, resourceId },
    });
    return [];
  }
}

export type SupervisorForChecklist = Awaited<ReturnType<typeof fetchSupervisorsForChecklist>>[number];
