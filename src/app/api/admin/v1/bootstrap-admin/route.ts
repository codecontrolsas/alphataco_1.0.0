import { connection } from 'next/server';
import { z } from 'zod';

import { bootstrapAdmin } from '@/features/AdminApi/lib/bootstrap-admin.server';
import { UNAUTHORIZED, adminError, adminJson, isModulesWriteAuthorized } from '@/features/AdminApi/lib/modules-http';
import { Logger } from '@/lib/logger';

const logger = new Logger('api/admin/v1/bootstrap-admin');

/**
 * Primer administrador de la instancia, para el alta remota de TaskApp (máquina a máquina, NO Server Action).
 * Exige `ADMIN_MODULES_TOKEN`. La contraseña temporal viaja solo en el cuerpo (HTTPS) y nunca se loguea.
 * - `mode: create`: alta del primer usuario (solo si la instancia no tiene ninguno); idempotente por mail.
 * - `mode: reset`: otra contraseña temporal para el dueño mientras no haya cambiado la anterior (409 si ya la cambió).
 */
const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().min(2).max(120),
    company: z.string().trim().max(120).nullable().optional().default(null),
    tempPassword: z.string().min(12).max(128),
    mode: z.enum(['create', 'reset']),
  })
  .strict();

export async function POST(request: Request) {
  await connection();
  if (!isModulesWriteAuthorized(request)) return UNAUTHORIZED();
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    // Sin el detalle del campo de la contraseña: solo las rutas.
    return adminError(400, 'INVALID_BODY', 'Pedido inválido', {
      fields: body.error.issues.map((i) => i.path.join('.')),
    });
  }
  try {
    const out = await bootstrapAdmin(body.data);
    switch (out.status) {
      case 'created':
        return adminJson(out, 201);
      case 'exists':
      case 'reset':
        return adminJson(out);
      case 'already_bootstrapped':
        return adminError(
          409,
          'ALREADY_BOOTSTRAPPED',
          'La instancia ya tiene usuarios: el primer administrador ya existe'
        );
      case 'password_already_changed':
        return adminError(409, 'PASSWORD_ALREADY_CHANGED', 'El administrador ya cambió la contraseña temporal');
      case 'not_found':
        return adminError(404, 'NOT_FOUND', 'No existe ese usuario');
      case 'invalid':
        return adminError(409, 'NOT_SEEDED', out.message);
    }
  } catch (error) {
    logger.error('No se pudo dar de alta el primer administrador', {
      data: { error: error instanceof Error ? error.message : 'error' },
    });
    return adminError(500, 'BOOTSTRAP_FAILED', 'No se pudo dar de alta el administrador');
  }
}
