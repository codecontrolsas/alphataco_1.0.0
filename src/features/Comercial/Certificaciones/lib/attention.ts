import type { certification_status } from '@/generated/prisma/enums';

/**
 * Estado que cuenta como "confirmada sin facturar". Lo comparten el contador de la banda de atención y
 * el filtro que aplica su botón sobre la tabla: una sola definición, un solo número.
 */
export const PENDING_INVOICING_STATUS = 'confirmada' satisfies certification_status;
