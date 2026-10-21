/**
 * Alcance de empresa del módulo de pedidos: solo los de la empresa activa (`preparte.company_id` es obligatorio).
 * Módulo sin directiva: lo importan las server actions del módulo.
 */
export function preparteCompanyScope(companyId: string) {
  return { company_id: companyId };
}
