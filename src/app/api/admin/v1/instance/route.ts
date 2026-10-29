import { connection } from 'next/server';
import { z } from 'zod';

import { applyInstanceChanges, getInstanceOverview } from '@/features/AdminApi/lib/instance.server';
import {
  UNAUTHORIZED,
  adminError,
  adminJson,
  isModulesReadAuthorized,
  isModulesWriteAuthorized,
} from '@/features/AdminApi/lib/modules-http';
import {
  instanceStateResponseSchema,
  instanceUpdateRequestSchema,
  instanceUpdateResponseSchema,
} from '@/features/AdminApi/schemas/instance';
import { Logger } from '@/lib/logger';

const logger = new Logger('api/admin/v1/instance');

/**
 * Controles de instancia para el panel de TaskApp: límite de empresas, pausa del sistema y banners globales.
 *
 * NO convertir a Server Action: es máquina a máquina, como `/modules` y `/status`. Misma autenticación que `/modules`:
 * escribir exige `ADMIN_MODULES_TOKEN`; leer acepta también el de solo lectura `ADMIN_STATUS_TOKEN`.
 * - `GET`: `{ version, limits, pause, banners }`. `version` es el hash de concurrencia que el `PUT` tiene que mandar.
 * - `PUT`: cambios parciales (`max_companies`, `pause`, `banners`) con `expectedVersion` (409 `STALE_PLAN` si cambió),
 *   `reason`, `X-Actor-Email` e `Idempotency-Key` (uuid: un reintento con la misma clave devuelve lo ya aplicado). Un
 *   límite menor a las empresas existentes responde 409 `LIMIT_BELOW_COMPANIES`.
 * Sigue funcionando con la instancia en pausa (la pausa se levanta por acá).
 */
export async function GET(request: Request) {
  await connection();
  if (!isModulesReadAuthorized(request)) return UNAUTHORIZED();
  try {
    return adminJson(instanceStateResponseSchema.parse(await getInstanceOverview()));
  } catch (error) {
    logger.error('No se pudo leer el estado de la instancia', { data: { error } });
    return adminError(503, 'INSTANCE_UNAVAILABLE', 'No se pudo leer el estado de la instancia');
  }
}

const headersSchema = z.object({
  actorEmail: z.string().trim().toLowerCase().email().max(254),
  idempotencyKey: z.string().uuid(),
});

export async function PUT(request: Request) {
  await connection();
  if (!isModulesWriteAuthorized(request)) return UNAUTHORIZED();

  const headers = headersSchema.safeParse({
    actorEmail: request.headers.get('x-actor-email') ?? '',
    idempotencyKey: request.headers.get('idempotency-key') ?? '',
  });
  if (!headers.success) {
    return adminError(400, 'INVALID_HEADERS', 'Faltan X-Actor-Email (email) o Idempotency-Key (uuid)');
  }
  const body = instanceUpdateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return adminError(400, 'INVALID_BODY', 'Pedido inválido', {
      issues: body.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`),
    });
  }

  try {
    const outcome = await applyInstanceChanges(body.data, {
      requestId: headers.data.idempotencyKey,
      actorEmail: headers.data.actorEmail,
    });
    switch (outcome.status) {
      case 'stale':
        return adminError(409, 'STALE_PLAN', 'El estado cambió desde la última lectura: volver a pedir GET /instance', {
          version: outcome.version,
        });
      case 'invalid':
        return adminError(400, 'INVALID_STATE', outcome.message);
      case 'below_companies':
        return adminError(
          409,
          'LIMIT_BELOW_COMPANIES',
          `La instancia ya tiene ${outcome.companiesTotal} empresas: el límite no puede ser menor (pedido: ${outcome.maxCompanies}). Para bajarlo, primero hay que borrar empresas desde soporte.`,
          { max_companies: outcome.maxCompanies, companies_total: outcome.companiesTotal }
        );
      case 'applied':
        return adminJson(
          instanceUpdateResponseSchema.parse({
            version: outcome.state.version,
            requestId: outcome.requestId,
            replayed: outcome.replayed,
            changes: outcome.changes,
            state: outcome.state,
          })
        );
    }
  } catch (error) {
    logger.error('No se pudo aplicar el cambio de la instancia', { data: { error } });
    return adminError(500, 'APPLY_FAILED', 'No se pudo aplicar el cambio');
  }
}
