/** Prefijo de las consultas del listado y de la banda de atención: invalidarlo refresca ambas. */
export const CERTIFICATIONS_QUERY_KEY = ['comercial', 'certifications'] as const;

export const CERTIFICATIONS_LIST_QUERY_KEY = [...CERTIFICATIONS_QUERY_KEY, 'list'] as const;
export const CERTIFICATIONS_ATTENTION_QUERY_KEY = [...CERTIFICATIONS_QUERY_KEY, 'attention'] as const;

/** Detalle de una certificación (se invalida tras cada transición). */
export function certificationDetailQueryKey(id: string) {
  return ['comercial', 'certification', id] as const;
}

export const CONTRACT_OPTIONS_QUERY_KEY = ['comercial', 'contract-options'] as const;
