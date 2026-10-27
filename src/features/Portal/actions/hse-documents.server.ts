'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { isHseEnabled } from '@/features/Hse/lib/feature-gate';
import { hseAcknowledgeSchema, type HseAcknowledgeInput } from '@/features/Hse/schemas/documents';
import { requirePortalEmployee, type PortalEmployee } from '@/features/Portal/actions/perimeter';
import { isPortalEnabled } from '@/features/Portal/lib/feature-gate';
import { Logger } from '@/lib/logger';
import { clearAttempts, consumeAttempt } from '@/shared/lib/login-rate-limit';
import { prisma } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { verifyPassword } from 'better-auth/crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

/**
 * Respuesta del empleado a un documento HSE desde el portal: aceptar (con su contraseña) o rechazar (con motivo).
 *
 * UNA sola acción (diagnóstico S10 del blueprint: en CodeControl la contraseña se verificaba en una llamada y la
 * aceptación iba en otra que no la exigía). Todo sale del servidor: el legajo de la sesión, la IP y el navegador del
 * request, y la constancia (nombre, puesto y legajo de HOY y la huella del PDF aceptado). La RLS por empleado y el
 * trigger `hse_ack_guard` impiden responder una fila ajena, archivada o ya respondida aunque esta acción fallara.
 */

const logger = new Logger('features/Portal/hse-documents');

/** Freno de contraseñas: 5 intentos fallidos cada 15 minutos por persona (mismo mecanismo que el login). */
const PASSWORD_RULE = { max: 5, windowSeconds: 15 * 60 };
const NOT_AVAILABLE = 'Este documento ya no está disponible para responder. Recargá la página.';

async function verifyEmployeePassword(employee: PortalEmployee, password: string): Promise<boolean> {
  // Las tablas `auth_*` están cerradas al rol de la app: se leen con el cliente de sistema (como el login del portal).
  const account = await prismaSystem.account.findFirst({
    where: { userId: employee.userId, providerId: 'credential' },
    select: { password: true },
  });
  if (!account?.password) return false;
  return verifyPassword({ hash: account.password, password });
}

async function requestFingerprint() {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  const userAgent = h.get('user-agent')?.slice(0, 500) ?? null;
  return { ip: ip?.slice(0, 100) ?? null, userAgent };
}

export async function respondHseDocument(
  input: HseAcknowledgeInput
): Promise<ActionResult<{ status: 'accepted' | 'rejected' }>> {
  if (!isPortalEnabled() || !isHseEnabled()) return fail('El portal no está disponible.');
  const parsed = hseAcknowledgeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos');
  const data = parsed.data;

  let employee: PortalEmployee;
  try {
    employee = await requirePortalEmployee();
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Tu sesión venció. Volvé a iniciar sesión.');
  }

  if (data.decision === 'accept') {
    const key = `hse-ack:${employee.userId}`;
    const attempt = consumeAttempt(key, PASSWORD_RULE);
    if (!attempt.allowed) {
      return fail(`Demasiados intentos. Probá de nuevo en ${Math.ceil(attempt.retryAfterSeconds / 60)} minutos.`);
    }
    if (!(await verifyEmployeePassword(employee, data.password))) {
      logger.warn('Aceptación HSE con contraseña incorrecta', { data: { employeeId: employee.employeeId } });
      return fail('La contraseña no es correcta.');
    }
    clearAttempts(key);
  }

  const { ip, userAgent } = await requestFingerprint();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const ack = await tx.hse_document_acknowledgements.findFirst({
        where: {
          id: data.ackId,
          employee_id: employee.employeeId,
          archived_at: null,
          status: 'pending',
          document: { status: 'published' },
        },
        select: {
          version_id: true,
          document: { select: { current_version_id: true } },
          version: { select: { file_sha256: true } },
        },
      });
      if (!ack || ack.version_id !== ack.document.current_version_id) return null;

      const status = data.decision === 'accept' ? ('accepted' as const) : ('rejected' as const);
      // Condicional: si otra pestaña respondió primero, no se pisa (count 0).
      const updated = await tx.hse_document_acknowledgements.updateMany({
        where: { id: data.ackId, employee_id: employee.employeeId, status: 'pending', archived_at: null },
        data: {
          status,
          responded_at: new Date(),
          reject_reason: data.decision === 'reject' ? data.reason : null,
          signer_name: `${employee.lastname} ${employee.firstname}`.trim(),
          signer_position: employee.position,
          signer_file: employee.file,
          file_sha256: ack.version.file_sha256,
          ip,
          user_agent: userAgent,
          updated_at: new Date(),
        },
      });
      return updated.count === 1 ? status : null;
    });
    if (!result) return fail(NOT_AVAILABLE);
    logger.info('Documento HSE respondido desde el portal', {
      data: { employeeId: employee.employeeId, ackId: data.ackId, status: result },
    });
    revalidatePath('/portal', 'layout');
    return ok({ status: result });
  } catch (error) {
    logger.error('Error al responder el documento HSE', { data: { error, ackId: data.ackId } });
    return fail('No se pudo registrar tu respuesta. Intentá de nuevo.');
  }
}
