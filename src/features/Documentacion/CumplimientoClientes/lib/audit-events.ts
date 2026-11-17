/** Eventos de `document_audit_events` (los escriben los triggers de documentos, la carga con IA y la carga externa). */
export const AUDIT_EVENTS = [
  'uploaded',
  'replaced',
  'approved',
  'rejected',
  'deleted',
  'external_upload',
  'ai_validated',
  'ai_pending',
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export const AUDIT_EVENT_LABELS: Record<AuditEvent, string> = {
  uploaded: 'Carga',
  replaced: 'Reemplazo',
  approved: 'Aprobación',
  rejected: 'Rechazo',
  deleted: 'Baja',
  external_upload: 'Carga externa',
  ai_validated: 'Validado por IA',
  ai_pending: 'IA: pendiente de revisión',
};

/** Quién hizo el cambio cuando no fue un usuario identificado. */
export const AUDIT_ACTOR_KIND_LABELS: Record<string, string> = {
  system: 'Sistema',
  job: 'Proceso automático',
  api: 'API externa',
  external: 'Carga externa',
  ai: 'IA',
  operator: 'Operario',
  employee: 'Portal del empleado',
};
