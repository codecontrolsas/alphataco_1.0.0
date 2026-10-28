'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { renderEvaluationPdf } from '@/features/Hse/pdf/evaluation-pdf.server';
import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import { requirePortalEmployee } from '@/features/Portal/actions/perimeter';
import { Logger } from '@/lib/logger';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { UUID_RE } from '@/shared/lib/storage-buckets';

const logger = new Logger('features/Portal/hse-evaluations');

/**
 * Constancia de resultado (PDF) de un examen PROPIO ya cerrado. El empleado sale de la sesión (nunca del pedido) y el
 * intento se acota a su legajo además de la RLS. No lleva el detalle por pregunta: revelaría la clave de respuestas.
 */
export async function getMyHseEvaluationPdf(input: {
  attemptId: string;
}): Promise<ActionResult<{ file: PdfDownload }>> {
  if (!(await isModuleEnabled('portal')) || !(await isModuleEnabled('hse')))
    return fail('El portal no está disponible.');
  let employee;
  try {
    employee = await requirePortalEmployee();
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Tu sesión venció. Volvé a iniciar sesión.');
  }
  if (typeof input?.attemptId !== 'string' || !UUID_RE.test(input.attemptId)) return fail('El examen no existe.');
  try {
    const result = await renderEvaluationPdf(input.attemptId, {
      kind: 'portal',
      companyId: employee.companyId,
      employee: {
        id: employee.employeeId,
        firstname: employee.firstname,
        lastname: employee.lastname,
        file: employee.file,
      },
    });
    if (!result) return fail('El examen no existe o todavía está en curso.');
    if (!result.ok) return fail(result.error);
    return ok({ file: result.file });
  } catch (error) {
    logger.error('Error al preparar la evaluación', { data: { error, attemptId: input.attemptId } });
    return fail('No se pudo preparar el PDF. Intentá de nuevo.');
  }
}
