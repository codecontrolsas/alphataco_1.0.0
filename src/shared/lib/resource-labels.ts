/**
 * Etiquetas de los recursos de Operaciones. Una sola fuente para la celda de la tabla, el filtro
 * faceteado y el Excel: la etiqueta de una opción del filtro TIENE que ser la que se ve en la celda.
 */

/** `[legajo] Apellido Nombre` (el legajo identifica al empleado; los nombres se repiten). */
export function employeeLabel(employee: {
  file?: string | null;
  lastname?: string | null;
  firstname?: string | null;
}): string {
  return `[${employee.file ?? '—'}] ${employee.lastname ?? ''} ${employee.firstname ?? ''}`.trim();
}

/** `Nº interno - dominio` de un vehículo propio. */
export function vehicleLabel(vehicle: { intern_number?: string | null; domain?: string | null }): string {
  return [vehicle.intern_number, vehicle.domain].filter(Boolean).join(' - ');
}
