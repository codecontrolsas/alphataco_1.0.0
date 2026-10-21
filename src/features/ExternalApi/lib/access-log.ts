import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';
import type { NextRequest } from 'next/server';

const logger = new Logger('features/ExternalApi/access-log');

/**
 * Registro de cada consulta a la API externa (ticket 671: "debemos proveer
 * usuario y contrasena para tener identificadas estas consultas").
 *
 * Se registran tambien los intentos fallidos: `attemptedClientId` guarda el
 * usuario que llego en el header aunque no exista, que es como se detecta a
 * alguien probando credenciales.
 */

export type ExternalApiAccessLogEntry = {
  /** Nombre logico del recurso, estable aunque cambie la URL */
  endpoint: string;
  statusCode: number;
  request: NextRequest;
  clientId?: string | null;
  attemptedClientId?: string | null;
  queryParams?: Prisma.InputJsonValue;
  responseTimeMs?: number;
  /** Codigo corto del error, NUNCA el stack ni datos del secreto */
  errorMessage?: string;
};

/** IP real del consumidor: en Vercel el request llega proxeado */
function extractIpAddress(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;
  return request.headers.get('x-real-ip');
}

/**
 * Persiste el acceso.
 *
 * Se espera el `await` a proposito: en un entorno serverless la funcion puede
 * terminar antes de que una promesa suelta llegue a escribir, y el registro se
 * perderia justo en los casos que importan.
 */
export async function logExternalApiAccess(entry: ExternalApiAccessLogEntry): Promise<void> {
  const { request } = entry;

  try {
    await prisma.external_api_access_logs.create({
      data: {
        external_api_client_id: entry.clientId ?? null,
        attempted_client_id: entry.attemptedClientId ?? null,
        endpoint: entry.endpoint,
        method: request.method,
        path: `${request.nextUrl.pathname}${request.nextUrl.search}`,
        query_params: entry.queryParams,
        status_code: entry.statusCode,
        ip_address: extractIpAddress(request),
        user_agent: request.headers.get('user-agent'),
        response_time_ms: entry.responseTimeMs ?? null,
        error_message: entry.errorMessage ?? null,
      },
    });
  } catch (error) {
    // El registro no puede tumbar la respuesta al sistema externo
    logger.error('No se pudo registrar el acceso a la API externa', {
      data: { error, endpoint: entry.endpoint, statusCode: entry.statusCode },
    });
  }
}
