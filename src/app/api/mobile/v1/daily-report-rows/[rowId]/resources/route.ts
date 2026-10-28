import { changeResourcesBodySchema } from '@/features/MobileApi/contracts/schemas';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, useCaseToResponse } from '@/features/MobileApi/lib/http';
import { changeRowResources } from '@/features/Operaciones/PartesDiarios/detail/use-cases/change-row-resources';
import { prismaBase } from '@/shared/lib/prisma';
import { z } from 'zod';

/** Altas y bajas explícitas de recursos de una línea (idempotente por `commandId`, con `baseVersion`). */
export const POST = mobileRoute<{ rowId: string }, z.output<typeof changeResourcesBodySchema>>({
  module: 'operaciones',
  body: changeResourcesBodySchema,
  run: async ({ ctx, params, body }) => {
    if (!z.string().uuid().safeParse(params.rowId).success) return mobileError(422, 'INVALID_INPUT', 'rowId inválido.');
    return useCaseToResponse(await changeRowResources({ db: prismaBase }, ctx, { ...body, rowId: params.rowId }));
  },
});
