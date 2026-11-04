import { trainingDetailResponseSchema } from '@/features/MobileApi/contracts/trainings';
import { loadTrainingAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { getTrainingDetail, TrainingNotFoundError } from '@/features/MobileApi/trainings/queries.server';
import { z } from 'zod';

/**
 * Detalle de una capacitación publicada: resumen, destinatarios, sesiones presenciales (con permiso sobre las actas),
 * material (solo metadatos), resultados agregados del examen (sin preguntas ni respuestas) y constancias.
 */
export const GET = mobileRoute<{ trainingId: string }>({
  module: 'hse',
  run: async ({ req, ctx, params }) => {
    if (!z.string().uuid().safeParse(params.trainingId).success)
      return mobileError(422, 'INVALID_INPUT', 'trainingId inválido.');
    const access = await loadTrainingAccess(ctx);
    if (!access.list) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver las capacitaciones.');
    try {
      return mobileReadJson(req, trainingDetailResponseSchema, await getTrainingDetail(ctx, params.trainingId, access));
    } catch (error) {
      if (error instanceof TrainingNotFoundError)
        return mobileError(404, 'NOT_FOUND', 'La capacitación no existe, no está publicada o no pertenece a la empresa activa.');
      throw error;
    }
  },
});
