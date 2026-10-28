import { connection } from 'next/server';

import { UNAUTHORIZED, adminError, adminJson, isModulesReadAuthorized } from '@/features/AdminApi/lib/modules-http';
import { getModuleChangeLog } from '@/features/AdminApi/lib/modules.server';
import { changeLogQuerySchema, changeLogResponseSchema } from '@/features/AdminApi/schemas/modules';
import { Logger } from '@/lib/logger';

const logger = new Logger('api/admin/v1/modules/log');

/** Historial de cambios de módulos (quién, cuándo, qué y por qué), agrupado por pedido: `?limit=50&before=<iso>`. */
export async function GET(request: Request) {
  await connection();
  if (!isModulesReadAuthorized(request)) return UNAUTHORIZED();
  const url = new URL(request.url);
  const query = changeLogQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    before: url.searchParams.get('before') ?? undefined,
  });
  if (!query.success) return adminError(400, 'INVALID_QUERY', 'Parámetros inválidos');
  try {
    return adminJson(changeLogResponseSchema.parse(await getModuleChangeLog(query.data)));
  } catch (error) {
    logger.error('No se pudo leer el historial de módulos', { data: { error } });
    return adminError(503, 'MODULES_UNAVAILABLE', 'No se pudo leer el historial');
  }
}
