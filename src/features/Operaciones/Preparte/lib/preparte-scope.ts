/**
 * Alcance de empresa del módulo de pedidos: los pedidos viejos no tienen `company_id`
 * y se siguen viendo desde cualquier empresa (mismo criterio que antes de la migración).
 * Módulo sin directiva: lo importan las server actions del módulo.
 */
export function preparteCompanyScope(companyId: string) {
  return { OR: [{ company_id: companyId }, { company_id: null }] };
}
