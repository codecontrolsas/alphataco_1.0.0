import { connection } from 'next/server';

import { UNAUTHORIZED, adminError, adminJson, isModulesWriteAuthorized } from '@/features/AdminApi/lib/modules-http';
import { previewModuleChanges } from '@/features/AdminApi/lib/modules.server';
import { planRequestSchema, planResponseSchema } from '@/features/AdminApi/schemas/modules';
import { Logger } from '@/lib/logger';

const logger = new Logger('api/admin/v1/modules/plan');

/**
 * Vista previa de un cambio de módulos (F3.1): qué se apagaría o encendería, qué queda bloqueado y por qué, la cascada
 * que agregaría `cascade: true`, los impactos blandos y la `stateVersion` que el `PUT` tiene que mandar. No escribe.
 * Con el token de escritura: anticipa lo que el `PUT` va a hacer.
 */
export async function POST(request: Request) {
  await connection();
  if (!isModulesWriteAuthorized(request)) return UNAUTHORIZED();
  const body = planRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return adminError(400, 'INVALID_BODY', 'Pedido inválido', { issues: body.error.issues.map((i) => i.message) });
  }
  try {
    return adminJson(planResponseSchema.parse(await previewModuleChanges(body.data)));
  } catch (error) {
    logger.error('No se pudo calcular el plan de módulos', { data: { error } });
    return adminError(503, 'MODULES_UNAVAILABLE', 'No se pudo calcular el plan');
  }
}
