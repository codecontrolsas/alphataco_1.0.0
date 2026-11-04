import { trainingPeopleQuerySchema, trainingPeopleResponseSchema } from '@/features/MobileApi/contracts/trainings';
import { loadTrainingAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { InvalidCursorError } from '@/features/MobileApi/lib/labels';
import { listTrainingPeople, TrainingNotFoundError } from '@/features/MobileApi/trainings/queries.server';
import { z } from 'zod';

/** Resultados por persona de una capacitación (lo pendiente primero), paginado por cursor. */
export const GET = mobileRoute<{ trainingId: string }>({
  module: 'hse',
  run: async ({ req, ctx, params }) => {
    if (!z.string().uuid().safeParse(params.trainingId).success)
      return mobileError(422, 'INVALID_INPUT', 'trainingId inválido.');
    const parsed = trainingPeopleQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return mobileError(422, 'INVALID_INPUT', `Parámetros inválidos: ${parsed.error.issues[0]?.path.join('.') ?? ''}`);
    }
    const access = await loadTrainingAccess(ctx);
    if (!access.list) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver las capacitaciones.');
    try {
      return mobileReadJson(
        req,
        trainingPeopleResponseSchema,
        await listTrainingPeople(ctx, params.trainingId, parsed.data)
      );
    } catch (error) {
      if (error instanceof TrainingNotFoundError)
        return mobileError(404, 'NOT_FOUND', 'La capacitación no existe, no está publicada o no pertenece a la empresa activa.');
      if (error instanceof InvalidCursorError)
        return mobileError(422, 'INVALID_INPUT', 'El cursor no es válido: volvé a la primera página.');
      throw error;
    }
  },
});
