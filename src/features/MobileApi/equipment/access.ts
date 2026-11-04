import type { MobilePermissions } from '../lib/user-permissions';

/**
 * Qué puede ver de Equipos el usuario de la app móvil: traducción EXACTA de la web, pantalla por pantalla.
 *
 * - Listados (`EquiposComponent` y los `actions.server` de cada lista): `view` de la subpestaña `vehicles` / `others`;
 *   los dados de baja, `view` de `inactive`.
 * - Ficha del vehículo (`requireVehicleView`): `detalle-equipo` visible (visibilidad inferida); sus bloques, como
 *   `VehicleReadView`: identificación y propiedad (`datos-basicos`), asignación (`asignacion`) y documentación
 *   (`documentacion:documentos-de-equipos` visible + `view` de permanentes / mensuales; privados con `view_private`).
 * - Ficha del equipamiento (`OtherEquipmentReadView`): `detalle-otro-equipo` visible; bloques `datos-basicos-otro`,
 *   `asignacion-otro` y sus documentos (`certificaciones-otro`).
 */
export function resolveEquipmentAccess(perms: MobilePermissions) {
  const vehicleRecord = perms.isTabVisible('equipos:detalle-equipo:view');
  const otherRecord = perms.isTabVisible('equipos:detalle-otro-equipo:view');
  const documentsTab = perms.isTabVisible('documentacion:documentos-de-equipos:view');
  const permanent = documentsTab && perms.has('documentacion:docs-equipos-permanentes:view');
  const monthly = documentsTab && perms.has('documentacion:docs-equipos-mensuales:view');
  const listInactive = perms.has('equipos:inactive:view');

  return {
    vehicle: {
      listActive: perms.has('equipos:vehicles:view'),
      listInactive,
      record: vehicleRecord,
      technical: vehicleRecord && perms.isTabVisible('equipos:datos-basicos:view'),
      assignment: vehicleRecord && perms.isTabVisible('equipos:asignacion:view'),
      documents: {
        visible: vehicleRecord && (permanent || monthly),
        permanent: vehicleRecord && permanent,
        monthly: vehicleRecord && monthly,
        privateTypes: perms.has('documentacion:documentos-de-equipos:view_private'),
      },
      certifications: false,
      /** Resumen documental en la lista: pestaña de documentos de equipos + permanentes o mensuales (sin exigir la ficha). */
      documentList: {
        visible: documentsTab && (permanent || monthly),
        permanent: documentsTab && permanent,
        monthly: documentsTab && monthly,
        privateTypes: perms.has('documentacion:documentos-de-equipos:view_private'),
      },
      /** Próximo service y última orden: `view` del historial de mantenimiento de la ficha (solo vehículos). */
      maintenance: vehicleRecord && perms.has('equipos:historial-mantenimiento-equipo:view'),
    },
    other: {
      listActive: perms.has('equipos:others:view'),
      listInactive,
      record: otherRecord,
      technical: otherRecord && perms.isTabVisible('equipos:datos-basicos-otro:view'),
      assignment: otherRecord && perms.isTabVisible('equipos:asignacion-otro:view'),
      documents: { visible: false, permanent: false, monthly: false, privateTypes: false },
      certifications: otherRecord && perms.isTabVisible('equipos:certificaciones-otro:view'),
      documentList: { visible: false, permanent: false, monthly: false, privateTypes: false },
      maintenance: false,
    },
    /** Parte diario: de ahí sale el chofer del equipo (el alerta documental del chofer exige además ver sus documentos). */
    reports: perms.has('operaciones:detalle-parte-diario:view'),
  };
}

export type EquipmentAccess = ReturnType<typeof resolveEquipmentAccess>;
export type EquipmentKindAccess = EquipmentAccess['vehicle'];
export type OtherEquipmentKindAccess = EquipmentAccess['other'];
