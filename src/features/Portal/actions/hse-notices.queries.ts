import 'server-only';

import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import { prisma } from '@/shared/lib/prisma';
import { cache } from 'react';

/**
 * Avisos de vencimiento del empleado (los genera el job `hse-expiry`). Lectura para Server Components: filtra por el
 * legajo de la sesión y, aunque se olvidara, la RLS por empleado de `hse_expiry_notices` solo devuelve los suyos.
 * Se muestran los de los últimos 60 días, el más nuevo primero.
 */
export const getMyHseNotices = cache(async (employee: PortalEmployee) => {
  if (!(await isModuleEnabled('hse'))) return [];
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const rows = await prisma.hse_expiry_notices.findMany({
    where: { employee_id: employee.employeeId, created_at: { gte: since } },
    orderBy: [{ created_at: 'desc' }, { due_on: 'asc' }],
    take: 10,
    select: { id: true, item_kind: true, item_id: true, item_title: true, due_on: true, window: true },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.item_kind,
    itemId: r.item_id,
    title: r.item_title,
    dueOn: r.due_on.toISOString().slice(0, 10),
    window: r.window,
    href: r.item_kind === 'training' ? `/portal/trainings/${r.item_id}` : '/portal/documents',
  }));
});
export type PortalHseNotice = Awaited<ReturnType<typeof getMyHseNotices>>[number];
