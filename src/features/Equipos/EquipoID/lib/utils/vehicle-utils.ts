

/**
 * Id de "Vehículos" en la tabla `types_of_vehicles`.
 * Es el unico valor valido en el form de vehiculos: los "Otros" (id 2) quedaron
 * obsoletos cuando se creo la entidad `other_equipment`, que tiene su propio form.
 */
export const VEHICLE_TYPE_OF_VEHICLE_ID = '1';

export function getVehicleTypeFields(typeOfVehicle: string) {
  const isVehicle = typeOfVehicle === 'Vehículos';

  return {
    showDomain: isVehicle,
    showChassis: isVehicle,
    showKilometer: true,
    showEngineHours: true,
    showSerie: !isVehicle,
    requireDomain: isVehicle,
    requireChassis: isVehicle,
    requireSerie: !isVehicle,
  };
}
