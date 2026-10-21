import 'server-only';

import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext, type TenantContext } from '@/shared/lib/tenant-context';

/** Las pantallas móviles del parte diario cuelgan de la misma pestaña que la web. */
const MODULE = 'operaciones';
const TAB = 'detalle-parte-diario';

/** Verdadero si el usuario del contexto tiene el permiso en la pestaña del detalle del parte diario (evaluado por la base). */
export async function hasDailyReportPermission(ctx: TenantContext, action: 'view' | 'update' | 'assign_resources'): Promise<boolean> {
  const rows = await runWithTenantContext(prismaBase, ctx, (tx) =>
    tx.$queryRaw<{ allowed: boolean }[]>`
      SELECT user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, ${action}) AS allowed`
  );
  return rows[0]?.allowed === true;
}
