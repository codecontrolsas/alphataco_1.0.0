import { authorizeServiceToken } from '@/shared/lib/service-token-auth';

/**
 * Autenticación y respuestas de `/api/admin/v1/modules*` (máquina a máquina, TaskApp → instancia).
 *
 * - Escritura (`PUT`, vista previa): solo `ADMIN_MODULES_TOKEN`.
 * - Lectura (`GET` de estado e historial): `ADMIN_MODULES_TOKEN` o el de solo lectura `ADMIN_STATUS_TOKEN`, para que el
 *   panel muestre la matriz sin tener el de escritura.
 * Sin token configurado no entra nadie (401, sin decir por qué).
 */
export function isModulesWriteAuthorized(request: Request): boolean {
  return authorizeServiceToken(request, process.env.ADMIN_MODULES_TOKEN?.trim()) === 'ok';
}

export function isModulesReadAuthorized(request: Request): boolean {
  // Se evalúan los dos siempre (mismo costo exista o no cada token).
  const write = authorizeServiceToken(request, process.env.ADMIN_MODULES_TOKEN?.trim()) === 'ok';
  const read = authorizeServiceToken(request, process.env.ADMIN_STATUS_TOKEN?.trim()) === 'ok';
  return write || read;
}

export function adminJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function adminError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {}
): Response {
  return adminJson({ error: { code, message, ...extra } }, status);
}

export const UNAUTHORIZED = () => adminError(401, 'UNAUTHORIZED', 'Unauthorized');
