'use server';

import { requireResourceAccess } from '@/features/Mantenimiento/shared/resource-access.server';
import { Logger } from '@/lib/logger';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionToken, getSessionUser, isSessionAnonymous } from '@/shared/lib/session';
import { canUserUseCompany, writeCompanyClaim, writeMaintenanceClaims } from '@/shared/lib/session-claims';
import { clearActiveCompanyCookie, setActiveCompanyCookie } from '@/shared/lib/tenant';
import { headers } from 'next/headers';

const deviationsLogger = new Logger('Mantenimiento/deviations');

function normalizeCuil(input: string) {
  return (input ?? '').replace(/[-\s]/g, '');
}

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

/**
 * Busca equipos (vehículos) por dominio o serie.
 *
 * Flujo anónimo (`/maintenance`): corre ANTES del login, así que no hay empresa activa y
 * la búsqueda no puede acotarse por sesión. Devuelve sólo identificadores del equipo
 * (dominio, serie, número interno), que es lo que el operario tipea en el cartel del QR.
 */
export async function searchEquipmentByDomain(domainOrSerie: string): Promise<
  | Ok<{
      equipment: Array<{
        id: string;
        domain: string | null;
        serie: string | null;
        intern_number: string | null;
        label: string;
      }>;
    }>
  | Err
> {
  if (!domainOrSerie || domainOrSerie.trim().length < 2) {
    return { ok: false, error: 'Debe ingresar al menos 2 caracteres para buscar.' };
  }

  const searchTerm = domainOrSerie.trim().toUpperCase();

  try {
    const data = await prisma.vehicles.findMany({
      where: {
        OR: [
          { domain: { contains: searchTerm, mode: 'insensitive' } },
          { serie: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: { id: true, domain: true, serie: true, intern_number: true },
      orderBy: { domain: { sort: 'asc', nulls: 'last' } },
      take: 10,
    });

    return {
      ok: true,
      equipment: data.map((v) => ({
        id: v.id,
        domain: v.domain,
        serie: v.serie,
        intern_number: v.intern_number,
        label: `${v.domain ?? v.serie ?? 'Sin dominio/serie'}${v.intern_number ? ` (Nº ${v.intern_number})` : ''}`,
      })),
    };
  } catch (error) {
    deviationsLogger.error('Error al buscar equipos por dominio o serie', { data: { error } });
    return { ok: false, error: 'Error al buscar equipos.' };
  }
}

/**
 * Fija la empresa activa del request a partir del equipo escaneado (login de invitado).
 *
 * La empresa sale del vehículo, nunca de la sesión ni del cliente, y la cookie se escribe
 * desde el servidor con `setActiveCompanyCookie()` — antes la escribía el cliente con
 * `js-cookie`, que es el mismo valor pero fuera del único punto de escritura server-side
 * (y sin los flags `secure`/`sameSite` que el helper aplica).
 *
 * Escribe las dos caras, con reglas distintas:
 *
 * - La COOKIE, siempre. Es una PROPUESTA: `getActiveCompanyId()` la revalida con
 *   `canUseAsActiveCompany()` antes de entregarla, así que por sí sola no da acceso a nada.
 * - El CLAIM, sólo si el invitado tiene un vínculo real con la empresa del equipo
 *   (`canUserUseCompany()`). Hace falta porque el claim le GANA a la cookie: el hook de alta de
 *   sesión ya estampó la empresa por defecto del invitado, así que sin esto la cookie del
 *   equipo escaneado no se usaba nunca. Y hace falta validarlo porque el claim no se revalida
 *   al leerlo: escribir ahí la empresa de un vehículo elegido en un buscador público sería
 *   exactamente el agujero que la invariante impide.
 *
 * Lo único que se exige siempre es que haya sesión (el login de invitado ya corrió) para no
 * dejar un endpoint que escribe cookies a cualquiera.
 */
export async function setActiveCompanyForEquipment(equipmentId: string): Promise<Ok<{ companyId: string }> | Err> {
  if (!equipmentId) return { ok: false, error: 'No se ha seleccionado un equipo.' };

  const user = await getSessionUser();
  if (!user?.id) return { ok: false, error: 'No hay sesión activa. Reintenta iniciar sesión.' };

  const vehicle = await prisma.vehicles.findUnique({
    where: { id: equipmentId },
    select: { company_id: true },
  });

  if (!vehicle?.company_id) {
    return { ok: false, error: 'No se pudo obtener la empresa del equipo seleccionado.' };
  }

  try {
    await setActiveCompanyCookie(vehicle.company_id);
  } catch (error) {
    deviationsLogger.warn('No se pudo fijar la empresa activa del equipo escaneado', { data: { error } });
  }

  // El claim sólo si la pertenencia es real; si no, queda la del hook de alta de sesión.
  if (await canUserUseCompany(user.id, vehicle.company_id)) {
    const sessionToken = await getSessionToken();
    if (sessionToken) {
      try {
        await writeCompanyClaim(sessionToken, vehicle.company_id);
      } catch (error) {
        deviationsLogger.warn('No se pudo fijar el claim de empresa del equipo escaneado', { data: { error } });
      }
    }
  }

  return { ok: true, companyId: vehicle.company_id };
}

/**
 * Completa la sesión anónima del operario: valida el CUIL contra el legajo, asegura el
 * profile y deja la empresa del EMPLEADO (o, si no tiene, la del equipo) en la cookie y en
 * los claims de la sesión.
 *
 * SÓLO corre sobre una sesión ANÓNIMA, y eso es parte del perímetro, no una formalidad:
 * más abajo escribe los claims `company` y `employee_id` de la sesión —el primero es el que
 * `getActiveCompanyId()` trata como de confianza y NO vuelve a validar, el segundo es con el
 * que se atribuyen las respuestas de checklist—. Sin el chequeo, un usuario logueado del
 * dashboard podía llamarla con el CUIL de un empleado de otra empresa (el `equipmentId` lo da
 * `searchEquipmentByDomain`, que es público a propósito) y plantarse esa empresa como empresa
 * activa de su propia cuenta — además de pisarse su propio profile con el upsert de más abajo.
 *
 * Este es EL flujo que motiva la invariante del claim, y por eso la escritura pasa por
 * `writeMaintenanceClaims()` (`shared/lib/session-claims.ts`, `server-only`) y no por ningún
 * endpoint de Better Auth: los dos campos son `input: false`, así que ni siquiera existe un
 * camino HTTP por el que el cliente pueda proponerlos.
 */
export async function completeMaintenanceEmployeeAnonymousSession(params: {
  cuil: string;
  equipmentId: string;
}): Promise<
  | Ok<{
      companyId: string;
      employeeId: string;
      employeeName: string;
      employeeEmail: string | null;
    }>
  | Err
> {
  const { cuil, equipmentId } = params;

  if (!cuil) return { ok: false, error: 'El CUIL es requerido.' };
  if (!equipmentId) return { ok: false, error: 'No se ha seleccionado un equipo.' };

  const [user, sessionToken] = await Promise.all([getSessionUser(), getSessionToken()]);
  if (!user?.id || !sessionToken) {
    return { ok: false, error: 'No hay sesión activa. Reintenta iniciar sesión.' };
  }

  // El flujo del QR arranca con `signInAnonymously()`; una sesión de dashboard acá es una
  // llamada directa a la action (ver el comentario de la función).
  if (!(await isSessionAnonymous())) {
    deviationsLogger.warn('Sesión no anónima intentando completar el login del QR', { data: { userId: user.id } });
    return { ok: false, error: 'Cerrá la sesión actual antes de entrar por el QR de mantenimiento.' };
  }

  // 1) Buscar empleado por CUIL (normalizado y, si no aparece, tal cual lo tipearon)
  const normalized = normalizeCuil(cuil);

  const employee =
    (await prismaSystem.employees.findFirst({
      where: { cuil: normalized },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        phone: true,
        company_id: true,
        is_active: true,
      },
    })) ??
    (normalized !== cuil
      ? await prismaSystem.employees.findFirst({
          where: { cuil },
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            phone: true,
            company_id: true,
            is_active: true,
          },
        })
      : null);

  if (!employee?.id) {
    return { ok: false, error: 'Empleado no encontrado.' };
  }

  if (employee.is_active === false) {
    return { ok: false, error: 'El empleado no se encuentra activo.' };
  }

  // 2) Empresa: SIEMPRE la del legajo.
  //
  //    Antes había un fallback a la empresa del VEHÍCULO cuando el empleado no tenía empresa
  //    asignada, y eso rompía la invariante: el claim de empresa es de confianza porque el
  //    servidor lo escribe después de validar la pertenencia, y la empresa de un vehículo
  //    elegido en un buscador público (`searchEquipmentByDomain`) no es una pertenencia de
  //    nadie. Quien conociera el CUIL de un empleado sin empresa podía estamparse como claim
  //    la empresa de cualquier equipo del sistema. Un legajo sin empresa no entra por el QR.
  const companyId = employee.company_id;
  if (!companyId) {
    return { ok: false, error: 'El empleado no tiene empresa asignada. Contacta al administrador.' };
  }

  const employeeId = employee.id;
  const employeeEmail = employee.email ?? null;
  const employeeName = `${employee.firstname ?? ''} ${employee.lastname ?? ''}`.trim();

  // 3) Asegurar el profile (hay FKs que apuntan a profile.id).
  //
  //    `employee_id` se escribe a propósito: es lo que hace que el claim de empresa que se
  //    escribe abajo satisfaga `canUseCompanyAsTenant()` por la rama de empleado. Sin eso, el
  //    claim del QR era el ÚNICO del sistema que no habría pasado la regla de pertenencia con
  //    la que se valida la cookie — la invariante valdría para todos los flujos menos justo el
  //    que la motivó. Ojo: estos profiles son de una sesión ANÓNIMA y se crea uno por login,
  //    así que las lecturas inversas por `employee_id` tienen que descartarlos
  //    (`shared/lib/employee-profile.ts`), y los paneles de indumentaria y taller exigen que la
  //    sesión NO sea anónima (`Clothing/actions/perimeter.ts`, `OperatorPanel/actions/perimeter.ts`).
  //
  //    El email es UNIQUE: si ya pertenece a OTRO profile se omite acá, para no romper el alta
  //    por un choque de unicidad.
  //    `role` es FK a `roles.name` y va en 'User', que es el default de la columna y el rol sin
  //    permisos que crea el seed. Antes decía 'Usuario', un nombre que no existe en el catálogo:
  //    contra una base nueva el upsert violaba la FK y el login del QR fallaba entero. No se
  //    notaba porque en los datos viejos ese rol existía por arrastre.
  let emailForProfile: string | null = employeeEmail;
  if (emailForProfile) {
    const existing = await prismaSystem.profile.findFirst({
      where: { email: emailForProfile },
      select: { id: true },
    });
    if (existing && existing.id !== user.id) {
      emailForProfile = null;
    }
  }

  try {
    await prismaSystem.profile.upsert({
      where: { id: user.id },
      update: {
        credential_id: user.id,
        email: emailForProfile,
        fullname: employeeName,
        role: 'User',
        employee_id: employeeId,
      },
      create: {
        id: user.id,
        credential_id: user.id,
        email: emailForProfile,
        fullname: employeeName,
        role: 'User',
        employee_id: employeeId,
      },
    });
  } catch (error) {
    deviationsLogger.error('No se pudo crear o actualizar el perfil del operario', { data: { error } });
    return { ok: false, error: 'No se pudo crear/actualizar el perfil.' };
  }

  // 4) Empresa activa del request, desde el servidor
  try {
    await setActiveCompanyCookie(companyId);
  } catch (error) {
    // Si falla establecerla (puede pasar en algunos contextos), continuar
    deviationsLogger.warn('No se pudo fijar la empresa activa desde el servidor', { data: { error } });
  }

  // 5) Claims de la sesión: la empresa y el legajo ya validados contra el CUIL.
  //    Es la escritura server-only de `session-claims.ts` — el cliente no tiene forma de
  //    proponer estos dos valores (ver el bloque de la invariante en `shared/lib/auth.ts`).
  try {
    await writeMaintenanceClaims(sessionToken, { companyId, employeeId });
    // El nombre para mostrar del operario sale del legajo, no de lo que tipeó.
    await prismaSystem.user.update({ where: { id: user.id }, data: { name: employeeName || 'Operario' } });
  } catch (error) {
    deviationsLogger.error('No se pudieron escribir los claims de la sesión del operario', { data: { error } });
    return { ok: false, error: 'No se pudo completar la sesión del empleado.' };
  }

  return { ok: true, companyId, employeeId, employeeName, employeeEmail };
}

/**
 * Opciones para acotar qué desvíos se consideran "pendientes".
 */
interface PendingDeviationsOptions {
  /** Limitar los desvíos a un único checklist de origen */
  checklistAnswerId?: string;
  /**
   * Excluir los desvíos que ya pertenecen a una solicitud de mantenimiento,
   * tenga o no tipo de reparación asignado. Es el mismo criterio que usa la vista
   * `equipments_with_pending_deviations`, que alimenta la tabla "Equipos con Desvíos".
   */
  onlyWithoutRequest?: boolean;
}

/**
 * Obtiene los desvíos pendientes (sin resolver) para un equipo.
 *
 * Por defecto un desvío se considera resuelto si su ítem de solicitud ya tiene
 * tipo de reparación asignado (`maintenance_request_items.repair_type_id`).
 *
 * Con `onlyWithoutRequest` se aplica el criterio más estricto de la tabla "Equipos con Desvíos":
 * cualquier desvío que ya esté dentro de una solicitud queda excluido.
 *
 * Perímetro: el equipo define la empresa (los desvíos se leen desde el flujo QR anónimo,
 * donde no hay sesión), y todo lo demás se acota a esa misma empresa.
 */
export async function getPendingDeviations(equipmentId: string, options?: PendingDeviationsOptions) {
  if (!equipmentId) {
    deviationsLogger.debug('Sin equipmentId, no hay desvíos que buscar');
    return [];
  }

  try {
    // Perímetro de dos caminos: operario del QR con legajo de la empresa del equipo, o usuario
    // del dashboard con esa empresa activa. Sin tab propia: lo llaman la ficha del equipo, la
    // tabla de equipos con desvíos y el formulario de checklist, cada uno con su permiso de
    // vista, así que alcanza con la pertenencia a la empresa activa. Sin acceso → lista vacía.
    let companyId: string;
    try {
      ({ companyId } = await requireResourceAccess('vehicle', equipmentId));
    } catch (error) {
      deviationsLogger.warn('Acceso denegado a los desvíos del equipo', { data: { equipmentId, error } });
      return [];
    }

    const allDeviations = await prisma.checklist_deviations.findMany({
      where: withCompany(
        {
          equipment_id: equipmentId,
          ...(options?.checklistAnswerId ? { checklist_answer_id: options.checklistAnswerId } : {}),
        },
        companyId
      ),
      select: {
        id: true,
        item_code: true,
        item_label: true,
        section_code: true,
        is_critical: true,
        driver_comment: true,
        created_at: true,
        checklist_answer_id: true,
        created_by_user_id: true,
        created_by_employee_id: true,
        checklist_answers: {
          select: {
            id: true,
            created_at: true,
            template_id: true,
            checklist_templates: { select: { id: true, name: true } },
          },
        },
        // Mínimo necesario para mostrar "cargado por": sin email ni CUIL.
        profile: { select: { id: true, fullname: true } },
        employees: { select: { id: true, firstname: true, lastname: true } },
        maintenance_request_items: { select: { repair_type_id: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    if (allDeviations.length === 0) return [];

    const pendingDeviations = allDeviations.filter((deviation) => {
      const items = deviation.maintenance_request_items;

      // Criterio estricto: cualquier desvío ya incluido en una solicitud queda fuera
      if (options?.onlyWithoutRequest && items.length > 0) return false;

      // Tiene tipo de reparación asignado
      return !items.some((item) => item.repair_type_id);
    });

    deviationsLogger.debug('Desvíos pendientes calculados', {
      data: {
        equipmentId,
        checklistAnswerId: options?.checklistAnswerId,
        onlyWithoutRequest: !!options?.onlyWithoutRequest,
        total: allDeviations.length,
        pendientes: pendingDeviations.length,
      },
    });

    return pendingDeviations;
  } catch (error) {
    deviationsLogger.error('Error al obtener los desvíos del equipo', { data: { error, equipmentId } });
    return [];
  }
}

/**
 * Cierra la sesión del operario en el flujo de mantenimiento.
 *
 * Vive en una Server Action (y no en el cliente) para que el único punto de contacto con Auth
 * siga siendo el servidor.
 */
export async function signOutMaintenanceSession(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Sin sesión válida el cierre es un no-op.
  }
  await clearActiveCompanyCookie();
}
