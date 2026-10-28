'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { isHseEnabled } from '@/features/Hse/lib/feature-gate';
import type { HsePdfDelivery } from '@/features/Hse/lib/pdf-delivery';
import { ensureCertificatePdf } from '@/features/Hse/pdf/hse-pdf.server';
import { hseSignCertificateSchema, type HseSignCertificateValues } from '@/features/Hse/schemas/records';
import { requirePortalEmployee, type PortalEmployee } from '@/features/Portal/actions/perimeter';
import { isPortalEnabled } from '@/features/Portal/lib/feature-gate';
import { checkSignaturePassword, requestFingerprint } from '@/features/Portal/lib/signature.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

/**
 * Constancia de capacitación del portal: firmarla (contraseña del empleado, en la misma acción) y descargarla.
 *
 * La firma la decide la base (`hse_sign_certificate`, SECURITY DEFINER): intento PROPIO, aprobado y vigente, sin otra
 * constancia vigente; arma el contenido con los datos del momento leídos de la base y calcula la huella. El navegador
 * manda solo el intento y la contraseña. Después, el servidor genera el PDF, lo guarda y lo registra en el legajo
 * (`ensureCertificatePdf`); si eso fallara, la constancia ya quedó firmada y el PDF se genera en la descarga.
 */

const logger = new Logger('features/Portal/hse-certificates');

const signResultSchema = z.union([
  z.object({ ok: z.literal(true), certificateId: z.string().uuid(), alreadySigned: z.boolean() }),
  z.object({ ok: z.literal(false), reason: z.enum(['not_found', 'not_passed', 'not_available', 'superseded']) }),
]);

const SIGN_MESSAGES = {
  not_found: 'No encontramos ese examen. Recargá la página.',
  not_passed: 'Solo se firma la constancia de un examen aprobado.',
  not_available: 'Esta capacitación ya no está disponible. Recargá la página.',
  superseded: 'Esa aprobación ya no es la vigente: firmá la constancia de tu última aprobación.',
} as const;

async function portalEmployee(): Promise<{ ok: true; employee: PortalEmployee } | { ok: false; error: string }> {
  if (!(await isPortalEnabled()) || !(await isHseEnabled()))
    return { ok: false, error: 'El portal no está disponible.' };
  try {
    return { ok: true, employee: await requirePortalEmployee() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Tu sesión venció. Volvé a iniciar sesión.' };
  }
}

/** Firma la constancia del intento aprobado. Idempotente: si ya estaba firmada devuelve la existente. */
export async function signHseCertificate(
  input: HseSignCertificateValues
): Promise<ActionResult<{ certificateId: string; alreadySigned: boolean }>> {
  const auth = await portalEmployee();
  if (!auth.ok) return fail(auth.error);
  const parsed = hseSignCertificateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos');

  const passwordError = await checkSignaturePassword(auth.employee, parsed.data.password, 'hse-certificate');
  if (passwordError) {
    logger.warn('Firma de constancia rechazada por la contraseña', { data: { employeeId: auth.employee.employeeId } });
    return fail(passwordError);
  }

  const { ip, userAgent } = await requestFingerprint();
  let certificateId: string;
  let alreadySigned: boolean;
  try {
    const rows = await prisma.$transaction(
      (tx) => tx.$queryRaw<{ r: unknown }[]>`
        SELECT public.hse_sign_certificate(${parsed.data.attemptId}::uuid, ${ip}, ${userAgent}) AS r`
    );
    const result = signResultSchema.parse(rows[0]?.r);
    if (!result.ok) return fail(SIGN_MESSAGES[result.reason]);
    certificateId = result.certificateId;
    alreadySigned = result.alreadySigned;
  } catch (error) {
    logger.error('Error al firmar la constancia', { data: { error, attemptId: parsed.data.attemptId } });
    return fail('No se pudo registrar tu firma. Intentá de nuevo.');
  }

  // PDF y legajo: si falla, la firma ya quedó y la descarga lo reintenta.
  const pdf = await ensureCertificatePdf(certificateId, { employeeId: auth.employee.employeeId }).catch(
    (error: unknown) => {
      logger.error('La constancia quedó firmada pero no se generó el PDF', { data: { error, certificateId } });
      return null;
    }
  );
  logger.info('Constancia HSE firmada', {
    data: { employeeId: auth.employee.employeeId, certificateId, alreadySigned, pdf: pdf?.ok ?? false },
  });
  revalidatePath('/portal', 'layout');
  return ok({ certificateId, alreadySigned });
}

/** URL de descarga de UNA constancia propia (la RLS no deja ver las ajenas). Verifica la huella del archivo. */
export async function getMyHseCertificateUrl(input: { certificateId: string }): Promise<ActionResult<HsePdfDelivery>> {
  const auth = await portalEmployee();
  if (!auth.ok) return fail(auth.error);
  if (typeof input?.certificateId !== 'string' || !UUID_RE.test(input.certificateId)) {
    return fail('La constancia no existe.');
  }
  try {
    const result = await ensureCertificatePdf(input.certificateId, { employeeId: auth.employee.employeeId });
    if (!result) return fail('La constancia no existe.');
    if (!result.ok) return fail(result.error);
    return ok('url' in result ? { url: result.url } : { file: result.file });
  } catch (error) {
    logger.error('Error al preparar la constancia', { data: { error, certificateId: input.certificateId } });
    return fail('No se pudo preparar la constancia. Intentá de nuevo.');
  }
}
