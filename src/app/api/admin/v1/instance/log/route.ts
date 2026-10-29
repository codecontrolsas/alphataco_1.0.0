import { connection } from 'next/server';

import { getInstanceChangeLog } from '@/features/AdminApi/lib/instance.server';
import { UNAUTHORIZED, adminError, adminJson, isModulesReadAuthorized } from '@/features/AdminApi/lib/modules-http';
import { instanceLogQuerySchema, instanceLogResponseSchema } from '@/features/AdminApi/schemas/instance';
import { Logger } from '@/lib/logger';

const logger = new Logger('api/admin/v1/instance/log');

/** Historial de cambios de los controles de instancia (quién, cuándo, qué y por qué), por pedido: `?limit=50&before=<iso>`. */
export async function GET(request: Request) {
  await connection();
  if (!isModulesReadAuthorized(request)) return UNAUTHORIZED();
  const url = new URL(request.url);
  const query = instanceLogQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    before: url.searchParams.get('before') ?? undefined,
  });
  if (!query.success) return adminError(400, 'INVALID_QUERY', 'Parámetros inválidos');
  try {
    return adminJson(instanceLogResponseSchema.parse(await getInstanceChangeLog(query.data)));
  } catch (error) {
    logger.error('No se pudo leer el historial de la instancia', { data: { error } });
    return adminError(503, 'INSTANCE_UNAVAILABLE', 'No se pudo leer el historial');
  }
}
