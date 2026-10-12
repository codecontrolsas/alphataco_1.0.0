/** Constantes de la tabla de retenciones sufridas. Módulo SIN directiva: lo usan el servidor y el cliente. */

export const CERTIFICATE_FILTER_LABELS = {
  WITH: 'Con certificado',
  WITHOUT: 'Sin certificado',
} as const;

export type CertificateFilterValue = keyof typeof CERTIFICATE_FILTER_LABELS;

export const NO_CERTIFICATE_LABEL = 'Sin certificado';
