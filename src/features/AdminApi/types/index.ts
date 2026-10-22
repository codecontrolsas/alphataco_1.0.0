import type { getInstanceStatus } from '../lib/status.server';

/** Respuesta de `GET /api/admin/v1/status`: inferida de la función, sin tipos a mano. */
export type InstanceStatus = Awaited<ReturnType<typeof getInstanceStatus>>;
