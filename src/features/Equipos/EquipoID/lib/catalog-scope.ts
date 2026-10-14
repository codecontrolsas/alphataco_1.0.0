/**
 * Alcance de los catálogos de equipos: los globales (`company_id NULL`: marcas, tipos, subtipos,
 * propietarios) conviven con los propios de la empresa activa. Módulo sin directiva para poder
 * importarlo desde las server actions de lectura y desde la validación de pertenencia al guardar.
 */
export function companyOrGlobal(companyId: string) {
  return { OR: [{ company_id: companyId }, { company_id: null }] };
}
