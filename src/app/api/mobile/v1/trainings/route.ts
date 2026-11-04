import { trainingListQuerySchema, trainingListResponseSchema } from '@/features/MobileApi/contracts/trainings';
import { loadTrainingAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { InvalidCursorError } from '@/features/MobileApi/lib/labels';
import { listTrainings } from '@/features/MobileApi/trainings/queries.server';

/**
 * Capacitaciones publicadas (HSE) con su cobertura, estado agregado y próxima sesión. Mismo permiso que la pestaña web
 * (`hse:capacitaciones:view`); la próxima sesión además exige `hse:actas:view`.
 */
export const GET = mobileRoute({
  module: 'hse',
  run: async ({ req, ctx }) => {
    const parsed = trainingListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return mobileError(422, 'INVALID_INPUT', `Parámetros inválidos: ${parsed.error.issues[0]?.path.join('.') ?? ''}`);
    }
    const access = await loadTrainingAccess(ctx);
    if (!access.list) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver las capacitaciones.');
    try {
      return mobileReadJson(req, trainingListResponseSchema, await listTrainings(ctx, parsed.data, access));
    } catch (error) {
      if (error instanceof InvalidCursorError)
        return mobileError(422, 'INVALID_INPUT', 'El cursor no es válido: volvé a la primera página.');
      throw error;
    }
  },
});
