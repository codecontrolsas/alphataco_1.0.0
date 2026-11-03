import { equipmentDetailResponseSchema, equipmentKindParamSchema } from '@/features/MobileApi/contracts/equipment';
import { getEquipmentDetail } from '@/features/MobileApi/equipment/queries.server';
import { loadEquipmentAccess } from '@/features/MobileApi/lib/access.server';
import { mobileRoute } from '@/features/MobileApi/lib/handler';
import { mobileError, mobileReadJson } from '@/features/MobileApi/lib/http';
import { z } from 'zod';

/**
 * Ficha de un equipo (`kind` = `vehicle` | `other`): datos técnicos, titular, contrato, afectación a clientes, estado
 * documental y sus documentos con vencimientos. Cada bloque viaja solo con el permiso de su sección en la web.
 */
export const GET = mobileRoute<{ kind: string; equipmentId: string }>({
  module: 'equipos',
  run: async ({ req, ctx, params }) => {
    const kind = equipmentKindParamSchema.safeParse(params.kind);
    if (!kind.success || !z.string().uuid().safeParse(params.equipmentId).success) {
      return mobileError(422, 'INVALID_INPUT', 'Clase o id de equipo inválido.');
    }
    const access = await loadEquipmentAccess(ctx);
    if (!access[kind.data].record) return mobileError(403, 'FORBIDDEN', 'No tenés permiso para ver la ficha del equipo.');
    const detail = await getEquipmentDetail(ctx, kind.data, params.equipmentId, access);
    if (!detail) return mobileError(404, 'NOT_FOUND', 'El equipo no existe o no pertenece a la empresa activa.');
    return mobileReadJson(req, equipmentDetailResponseSchema, detail);
  },
});
