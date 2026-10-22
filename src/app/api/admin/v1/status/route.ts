import { connection } from 'next/server';

import { getInstanceStatus } from '@/features/AdminApi/lib/status.server';
import type { InstanceStatus } from '@/features/AdminApi/types';
import { Logger } from '@/lib/logger';
import { authorizeServiceToken } from '@/shared/lib/service-token-auth';

const logger = new Logger('api/admin/v1/status');

/** El estado se recalcula como mucho cada 30 s: protege la base aunque el token se filtre. */
const CACHE_TTL_MS = 30_000;
let cached: { at: number; body: InstanceStatus } | null = null;

/**
 * Estado interno de la instancia para la sala de control de TaskApp (solo lectura).
 *
 * NO convertir a Server Action: es máquina a máquina (TaskApp → instancia), como /api/health
 * y /api/jobs/*. No pasa por el proxy de sesión (`src/proxy.ts`, matcher /dashboard/:path*):
 * la única llave es ADMIN_STATUS_TOKEN. Sin token configurado no entra nadie (401, sin detalle).
 * No devuelve datos de negocio ni PII: versión, migraciones, módulos, conteos y jobs agregados.
 * No declarar `dynamic` (con `cacheComponents` activado es error de compilación).
 */
export async function GET(request: Request) {
  await connection();
  const auth = authorizeServiceToken(request, process.env.ADMIN_STATUS_TOKEN?.trim());
  if (auth !== 'ok') {
    logger.warn('Pedido de estado rechazado', { data: { reason: auth } });
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    if (!cached || Date.now() - cached.at > CACHE_TTL_MS) {
      cached = { at: Date.now(), body: await getInstanceStatus() };
    }
    return Response.json(cached.body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('No se pudo armar el estado de la instancia', { data: { error } });
    return Response.json({ error: 'status_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
