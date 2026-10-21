import { changeStatusBodySchema } from '@/features/MobileApi/contracts/schemas';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, useCaseToResponse } from '@/features/MobileApi/lib/http';
import { changeRowStatus } from '@/features/Operaciones/PartesDiarios/detail/use-cases/change-row-status';
import { prismaBase } from '@/shared/lib/prisma';
import { z } from 'zod';

/** Cambia el estado de una línea o completa un turno (idempotente por `commandId`, con `baseVersion`). */
export const POST = mobileRoute<{ rowId: string }, z.output<typeof changeStatusBodySchema>>({
  body: changeStatusBodySchema,
  run: async ({ ctx, params, body }) => {
    if (!z.string().uuid().safeParse(params.rowId).success) return mobileError(422, 'INVALID_INPUT', 'rowId inválido.');
    return useCaseToResponse(await changeRowStatus({ db: prismaBase }, ctx, { ...body, rowId: params.rowId }));
  },
});
