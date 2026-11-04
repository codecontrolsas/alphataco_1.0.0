import type { MobilePermissions } from '../lib/user-permissions';

/**
 * Qué puede ver de Empleados el usuario de la app móvil. Es la traducción EXACTA de lo que hace la web, pantalla por
 * pantalla, para que la app no muestre nada que la web oculta:
 *
 * - Listado de activos / de bajas: `view` de cada subpestaña (`canViewList` del listado web).
 * - Legajo: `view` de `employees` con visibilidad inferida (`canViewServer` de la página del legajo).
 * - Bloques del legajo (`EmployeeReadView`): personales; contacto solo junto con personales; laborales (puesto,
 *   convenio y asignaciones).
 * - Documentación: pestaña visible + `view` de permanentes / mensuales (`assertDocumentListAccess`) y los tipos
 *   privados solo con `view_private`.
 * - Diagrama: visible con la consulta de novedades del empleado o con la carga de diagramas.
 * - Indumentaria: pestaña visible.
 */
export function resolveEmployeeAccess(perms: MobilePermissions) {
  const canViewRecord = perms.isTabVisible('empleados:employees:view');
  const personal = perms.isTabVisible('empleados:datos-personales:view');
  const documentsTab = perms.isTabVisible('documentacion:documentos-de-empleados:view');
  const permanent = documentsTab && perms.has('documentacion:docs-empleados-permanentes:view');
  const monthly = documentsTab && perms.has('documentacion:docs-empleados-mensuales:view');

  return {
    listActive: perms.has('empleados:empleados-activos:view'),
    listInactive: perms.has('empleados:empleados-inactivos:view'),
    record: canViewRecord,
    personal: canViewRecord && personal,
    contact: canViewRecord && personal && perms.isTabVisible('empleados:datos-contacto:view'),
    work: canViewRecord && perms.isTabVisible('empleados:datos-laborales:view'),
    /**
     * Resumen documental en la lista (`documentSummary`, `alerts`, `totals.withAlerts`): revela el estado de los
     * documentos, así que exige la lista de documentos de empleados (pestaña + permanentes o mensuales), no solo la
     * lista de empleados. Los tipos privados cuentan solo con `view_private`.
     */
    documentList: {
      visible: documentsTab && (permanent || monthly),
      permanent: documentsTab && permanent,
      monthly: documentsTab && monthly,
      privateTypes: perms.has('documentacion:documentos-de-empleados:view_private'),
    },
    documents: {
      visible: canViewRecord && (permanent || monthly),
      permanent: canViewRecord && permanent,
      monthly: canViewRecord && monthly,
      privateTypes: perms.has('documentacion:documentos-de-empleados:view_private'),
    },
    diagram:
      canViewRecord &&
      (perms.isTabVisible('empleados:diagramas-empleado:view') || perms.isTabVisible('empleados:new:view')),
    clothing: canViewRecord && perms.isTabVisible('empleados:indumentaria_empleado:view'),
    /** Licencias y ausencias: salen de las novedades del diagrama, así que llevan el mismo permiso que `diagram`. */
    absences:
      canViewRecord &&
      (perms.isTabVisible('empleados:diagramas-empleado:view') || perms.isTabVisible('empleados:new:view')),
    /** Capacitaciones (HSE): `view` de la pestaña Capacitaciones; además, el módulo `hse` encendido. */
    trainings: canViewRecord && perms.has('hse:capacitaciones:view'),
    /** Partes diarios: de ahí salen los equipos asignados y la actividad de asignaciones. */
    reports: canViewRecord && perms.has('operaciones:detalle-parte-diario:view'),
    /** Clases de equipo que puede ver en lista (los equipos asignados solo muestran las que puede listar). */
    equipmentLists: {
      vehicle: perms.has('equipos:vehicles:view'),
      other: perms.has('equipos:others:view'),
    },
  };
}

export type EmployeeAccess = ReturnType<typeof resolveEmployeeAccess>;
