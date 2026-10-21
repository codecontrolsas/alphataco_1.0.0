import 'server-only';

import { connection } from 'next/server';
import type { z } from 'zod';
import { Logger } from '@/lib/logger';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { isMobileApiEnabled } from './config';
import { resolveMobileContext } from './context';
import { mobileError } from './http';

const logger = new Logger('features/MobileApi');

interface RouteArgs<TParams, TBody> {
  req: Request;
  params: TParams;
  body: TBody;
  ctx: TenantContext;
  sessionToken: string;
}

/**
 * Envoltura común de las rutas de `/api/mobile/v1`, en este orden:
 *  1. `connection()`: con `cacheComponents` un GET que no lee el request se prerenderiza en el build; esto lo evita.
 *  2. Compuerta de encendido: apagada, toda la API responde 404 `MOBILE_API_DISABLED`.
 *  3. Autenticación (salvo `auth: false`): contexto de empresa y usuario desde el token.
 *  4. Validación del cuerpo con Zod (422 `INVALID_INPUT`).
 *  5. Cualquier excepción se convierte en 500 sin detalle.
 */
export function mobileRoute<TParams = Record<string, never>, TBody = undefined>(config: {
  auth?: boolean;
  body?: z.ZodType<TBody, z.ZodTypeDef, unknown>;
  run: (args: RouteArgs<TParams, TBody>) => Promise<Response>;
}) {
  return async (req: Request, route: { params: Promise<TParams> }): Promise<Response> => {
    await connection();
    if (!isMobileApiEnabled()) return mobileError(404, 'MOBILE_API_DISABLED', 'La API móvil no está habilitada en esta instancia.');

    try {
      let ctx: TenantContext = { companyId: '', userId: null, kind: 'user' };
      let sessionToken = '';
      if (config.auth !== false) {
        const resolved = await resolveMobileContext(req);
        if (!resolved.ok) return mobileError(resolved.status, resolved.code, resolved.message);
        ctx = resolved.ctx;
        sessionToken = resolved.sessionToken;
      }

      let body = undefined as TBody;
      if (config.body) {
        const raw = await req.json().catch(() => undefined);
        const parsed = config.body.safeParse(raw);
        if (!parsed.success) return mobileError(422, 'INVALID_INPUT', `Pedido inválido: ${parsed.error.issues[0]?.message ?? 'cuerpo ausente'}`);
        body = parsed.data;
      }

      return await config.run({ req, params: await route.params, body, ctx, sessionToken });
    } catch (error) {
      logger.error('Error no controlado en la API móvil', { data: { error } });
      return mobileError(500, 'INTERNAL_ERROR', 'Error interno.');
    }
  };
}
