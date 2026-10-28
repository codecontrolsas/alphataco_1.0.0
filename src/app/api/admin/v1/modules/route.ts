import { connection } from 'next/server';
import { z } from 'zod';

import {
  UNAUTHORIZED,
  adminError,
  adminJson,
  isModulesReadAuthorized,
  isModulesWriteAuthorized,
} from '@/features/AdminApi/lib/modules-http';
import { applyModuleChanges, getModulesOverview } from '@/features/AdminApi/lib/modules.server';
import {
  applyRequestSchema,
  applyResponseSchema,
  modulesListResponseSchema,
  planResponseSchema,
} from '@/features/AdminApi/schemas/modules';
import { Logger } from '@/lib/logger';

const logger = new Logger('api/admin/v1/modules');

/**
 * Control de módulos por instancia y por empresa (F3.1) para el panel de TaskApp.
 *
 * NO convertir a Server Action: es máquina a máquina, como `/api/admin/v1/status`, y no pasa por el proxy de sesión.
 * - `GET`: catálogo con dependencias y dependientes, estado de la instancia y de cada empresa, `stateVersion`.
 * - `PUT`: aplica un cambio ya revisado con `POST /modules/plan`. Exige `expectedStateVersion` (409 `STALE_PLAN` si el
 *   estado cambió desde la vista previa), `reason`, `X-Actor-Email` e `Idempotency-Key` (uuid: un reintento con la misma
 *   clave devuelve lo ya aplicado). Un plan con bloqueos responde 409 `BLOCKED` con el detalle.
 * Sin cache: el cambio se ve en el request siguiente de la app.
 */
export async function GET(request: Request) {
  await connection();
  if (!isModulesReadAuthorized(request)) return UNAUTHORIZED();
  try {
    return adminJson(modulesListResponseSchema.parse(await getModulesOverview()));
  } catch (error) {
    logger.error('No se pudo leer el estado de los módulos', { data: { error } });
    return adminError(503, 'MODULES_UNAVAILABLE', 'No se pudo leer el estado de los módulos');
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
  const body = applyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return adminError(400, 'INVALID_BODY', 'Pedido inválido', { issues: body.error.issues.map((i) => i.message) });
  }

  try {
    const outcome = await applyModuleChanges(body.data, {
      requestId: headers.data.idempotencyKey,
      actorEmail: headers.data.actorEmail,
    });
    if (outcome.status === 'stale') {
      return adminError(409, 'STALE_PLAN', 'El estado cambió desde la vista previa: volver a pedir el plan', {
        stateVersion: outcome.stateVersion,
      });
    }
    if (outcome.status === 'blocked') {
      return adminError(409, 'BLOCKED', 'El cambio tiene bloqueos', { plan: planResponseSchema.parse(outcome.plan) });
    }
    return adminJson(
      applyResponseSchema.parse({
        stateVersion: outcome.stateVersion,
        requestId: outcome.requestId,
        replayed: outcome.replayed,
        applied: outcome.applied,
        // Reconciliación de cachés al encender (documentos, HSE): F3.2.
        reconcile: [],
      })
    );
  } catch (error) {
    logger.error('No se pudo aplicar el cambio de módulos', { data: { error } });
    return adminError(500, 'APPLY_FAILED', 'No se pudo aplicar el cambio');
  }
}
