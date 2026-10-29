'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import {
  hseAttemptIdSchema,
  hseMarkMaterialReadSchema,
  hseSaveAnswerSchema,
  hseStartAttemptSchema,
  type HseSaveAnswerInput,
} from '@/features/Hse/schemas/trainings';
import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import { requirePortalEmployee, type PortalEmployee } from '@/features/Portal/actions/perimeter';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

/**
 * Examen del portal. Cada acción: portal y HSE prendidos, empleado de la sesión (nunca un id del cliente) y una
 * función SQL `SECURITY DEFINER` que decide todo con datos de la base: que el intento sea suyo, que esté abierto, que
 * no haya vencido (reloj de la base) y, al cerrar, el puntaje con la clave de respuestas (que el navegador nunca ve).
 * El cliente manda solo la opción elegida: no hay ningún campo "correcta" que pueda manipular.
 */

const logger = new Logger('features/Portal/hse-trainings');

const UNAVAILABLE = 'Esta capacitación ya no está disponible. Recargá la página.';

async function portalEmployee(): Promise<{ ok: true; employee: PortalEmployee } | { ok: false; error: string }> {
  if (!(await isModuleEnabled('portal')) || !(await isModuleEnabled('hse')))
    return { ok: false, error: 'El portal no está disponible.' };
  try {
    return { ok: true, employee: await requirePortalEmployee() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Tu sesión venció. Volvé a iniciar sesión.' };
  }
}

/** Resultado JSON de las funciones del examen (se valida: no se confía en la forma). */
const startResultSchema = z.union([
  z.object({ ok: z.literal(true), attemptId: z.string().uuid(), resumed: z.boolean() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not_available', 'already_passed', 'no_attempts_left', 'materials_pending', 'no_questions']),
    pending: z.number().optional(),
  }),
]);
const saveResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.enum(['closed', 'expired']) }),
]);
const gradeResultSchema = z.object({
  status: z.enum(['submitted', 'expired']),
  scorePercent: z.coerce.number(),
  passed: z.boolean(),
});

const START_MESSAGES = {
  not_available: UNAVAILABLE,
  already_passed: 'Ya aprobaste esta capacitación.',
  no_attempts_left: 'No te quedan intentos. Consultá con el área de HSE.',
  materials_pending: 'Antes de rendir tenés que leer el material obligatorio.',
  no_questions: 'El examen todavía no tiene preguntas.',
} as const;

function revalidateTraining(trainingId: string) {
  revalidatePath('/portal', 'layout');
  revalidatePath(`/portal/trainings/${trainingId}`);
}

/** El empleado marca que leyó (o vio) un material. Idempotente. */
export async function markHseMaterialRead(input: {
  materialId: string;
  trainingId: string;
}): Promise<ActionResult<null>> {
  const auth = await portalEmployee();
  if (!auth.ok) return fail(auth.error);
  const parsed = hseMarkMaterialReadSchema.extend({ trainingId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(UNAVAILABLE);
  try {
    await prisma.$transaction(
      (tx) => tx.$executeRaw`SELECT public.hse_mark_material_read(${parsed.data.materialId}::uuid)`
    );
    revalidateTraining(parsed.data.trainingId);
    return ok(null);
  } catch (error) {
    logger.warn('No se pudo registrar la lectura del material', {
      data: { error, employeeId: auth.employee.employeeId, materialId: parsed.data.materialId },
    });
    return fail(UNAVAILABLE);
  }
}

/**
 * El empleado ABRIÓ un material (clic en el enlace): deja la primera y la última apertura para medir el tiempo de
 * estudio. NO cuenta como lectura (no destraba el examen). Mejor esfuerzo: nunca interrumpe la apertura del archivo.
 */
export async function markHseMaterialOpened(input: { materialId: string }): Promise<ActionResult<null>> {
  const auth = await portalEmployee();
  if (!auth.ok) return fail(auth.error);
  const parsed = hseMarkMaterialReadSchema.safeParse({ materialId: input?.materialId });
  if (!parsed.success) return fail(UNAVAILABLE);
  try {
    await prisma.$transaction(
      (tx) => tx.$executeRaw`SELECT public.hse_mark_material_opened(${parsed.data.materialId}::uuid)`
    );
    return ok(null);
  } catch (error) {
    logger.warn('No se pudo registrar la apertura del material', {
      data: { error, employeeId: auth.employee.employeeId, materialId: parsed.data.materialId },
    });
    return fail(UNAVAILABLE);
  }
}

/**
 * Empieza (o retoma) el examen y lleva al examen con un `redirect()` de la propia acción.
 *
 * Antes la acción devolvía el intento y el cliente hacía `router.push(...)`: la revalidación de la acción re-renderizaba
 * la página actual (que ya mostraba "Retomar el examen") y esa actualización podía pisar la navegación, así que a veces
 * la pantalla quedaba en el detalle en vez de entrar al examen. Con el `redirect()` del servidor la navegación y la
 * revalidación viajan en la MISMA respuesta: no hay carrera. Solo devuelve algo cuando no se puede empezar.
 */
export async function startHseAttempt(input: { trainingId: string }): Promise<ActionResult<null>> {
  const auth = await portalEmployee();
  if (!auth.ok) return fail(auth.error);
  const parsed = hseStartAttemptSchema.safeParse(input);
  if (!parsed.success) return fail(UNAVAILABLE);
  let attemptId: string;
  try {
    const rows = await prisma.$transaction(
      (tx) => tx.$queryRaw<{ r: unknown }[]>`SELECT public.hse_start_attempt(${parsed.data.trainingId}::uuid) AS r`
    );
    const result = startResultSchema.parse(rows[0]?.r);
    if (!result.ok) return fail(START_MESSAGES[result.reason]);
    attemptId = result.attemptId;
    logger.info('Examen HSE iniciado', {
      data: {
        employeeId: auth.employee.employeeId,
        trainingId: parsed.data.trainingId,
        attemptId,
        resumed: result.resumed,
      },
    });
  } catch (error) {
    logger.error('Error al iniciar el examen', { data: { error, trainingId: parsed.data.trainingId } });
    return fail('No se pudo iniciar el examen. Intentá de nuevo.');
  }
  // Fuera del try: `redirect()` lanza NEXT_REDIRECT y el catch lo convertiría en un error.
  revalidateTraining(parsed.data.trainingId);
  redirect(`/portal/trainings/${parsed.data.trainingId}/attempt`);
}

/**
 * Guarda la opción elegida en una pregunta. Devuelve los segundos que quedan según el reloj de la base, para que el
 * temporizador del navegador se corrija con cada respuesta. `closed`: el intento ya se cerró (por tiempo o en otra
 * pestaña): el cliente lleva al resultado.
 */
export async function saveHseAnswer(
  input: HseSaveAnswerInput
): Promise<ActionResult<{ status: 'saved' | 'closed'; secondsLeft: number | null }>> {
  const auth = await portalEmployee();
  if (!auth.ok) return fail(auth.error);
  const parsed = hseSaveAnswerSchema.safeParse(input);
  if (!parsed.success) return fail('La respuesta no es válida.');
  const { attemptId, questionId, optionId } = parsed.data;
  try {
    const { result, secondsLeft } = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ r: unknown }[]>`
        SELECT public.hse_save_answer(${attemptId}::uuid, ${questionId}::uuid, ${optionId}::uuid) AS r`;
      const clock = await tx.$queryRaw<{ seconds_left: number | null }[]>`
        SELECT CASE WHEN deadline_at IS NULL THEN NULL
                    ELSE GREATEST(0, floor(EXTRACT(EPOCH FROM (deadline_at - now()))))::int END AS seconds_left
        FROM public.hse_training_attempts WHERE id = ${attemptId}::uuid`;
      return { result: saveResultSchema.parse(rows[0]?.r), secondsLeft: clock[0]?.seconds_left ?? null };
    });
    return ok({ status: result.ok ? 'saved' : 'closed', secondsLeft });
  } catch (error) {
    logger.warn('Respuesta rechazada', { data: { error, employeeId: auth.employee.employeeId, attemptId } });
    return fail('No se pudo guardar la respuesta. Revisá tu conexión e intentá de nuevo.');
  }
}

/**
 * Envía el examen: lo corrige el servidor con UNA sola regla (`hse_grade_attempt`). Idempotente: si ya estaba cerrado
 * (por tiempo o en otra pestaña) devuelve ese resultado. Las preguntas sin responder cuentan como incorrectas.
 */
export async function submitHseAttempt(input: {
  attemptId: string;
}): Promise<ActionResult<{ attemptId: string; passed: boolean; scorePercent: number }>> {
  const auth = await portalEmployee();
  if (!auth.ok) return fail(auth.error);
  const parsed = hseAttemptIdSchema.safeParse(input);
  if (!parsed.success) return fail(UNAVAILABLE);
  try {
    const { result, trainingId } = await prisma.$transaction(async (tx) => {
      const attempt = await tx.hse_training_attempts.findFirst({
        where: { id: parsed.data.attemptId, employee_id: auth.employee.employeeId },
        select: { training_id: true },
      });
      if (!attempt) throw new Error('El intento no existe');
      const rows = await tx.$queryRaw<
        { r: unknown }[]
      >`SELECT public.hse_grade_attempt(${parsed.data.attemptId}::uuid) AS r`;
      return { result: gradeResultSchema.parse(rows[0]?.r), trainingId: attempt.training_id };
    });
    logger.info('Examen HSE enviado', {
      data: { employeeId: auth.employee.employeeId, attemptId: parsed.data.attemptId, passed: result.passed },
    });
    revalidateTraining(trainingId);
    return ok({ attemptId: parsed.data.attemptId, passed: result.passed, scorePercent: result.scorePercent });
  } catch (error) {
    logger.error('Error al enviar el examen', { data: { error, attemptId: parsed.data.attemptId } });
    return fail('No se pudo enviar el examen. Tus respuestas quedaron guardadas: intentá de nuevo.');
  }
}
