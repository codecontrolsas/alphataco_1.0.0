import { authorizeServiceToken, type ServiceTokenAuthResult } from '@/shared/lib/service-token-auth';

/**
 * Autenticación de los endpoints `/api/jobs/*`.
 *
 * El contenedor `cron` del compose manda `Authorization: Bearer $JOBS_TOKEN` (ver
 * `docker/cron/crontab`). No hay sesión: un `curl` desde otro contenedor no trae cookies.
 *
 * La comparación en tiempo constante vive en `src/shared/lib/service-token-auth.ts` (compartida
 * con `/api/admin/v1/status`).
 */
export type JobAuthResult = ServiceTokenAuthResult;

/**
 * `ok` sólo si el header trae exactamente el `JOBS_TOKEN` del entorno.
 *
 * Sin `JOBS_TOKEN` configurado NADIE entra (`token-not-configured`): la alternativa —dejar
 * pasar— convertiría un despliegue con la variable vacía en tres endpoints abiertos que
 * mandan correos. El llamador responde 401 en los dos casos, sin decir cuál fue.
 */
export function authorizeJobRequest(request: Request): JobAuthResult {
  return authorizeServiceToken(request, process.env.JOBS_TOKEN?.trim());
}
