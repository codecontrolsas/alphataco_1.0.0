import 'server-only';

import { loadUserBoards, type DashboardBoard } from '@/features/Dashboard/Boards/lib/boards.server';
import { getWidgetDefinition, type WidgetId } from '@/features/Dashboard/lib/widget-registry';
import { Logger } from '@/lib/logger';
import { runInTenantScope, type TenantContext } from '@/shared/lib/tenant-context';
import { isSupportedWidget, WIDGET_DATA_SCHEMAS } from '../contracts/dashboards';
import { argentinaDateTime } from '../lib/labels';
import type { DashboardAccess } from './access';
import { buildWidgetData, createWidgetEnv } from './widgets.server';

const logger = new Logger('features/MobileApi/dashboards');

export class DashboardNotFoundError extends Error {}

/** Widgets del tablero que el rol ve (permisos de la web + módulos de la empresa), en el orden del tablero. */
function visibleLayout(board: DashboardBoard, access: DashboardAccess) {
  return board.layout.filter((item) => access.canSeeWidget(item.widgetId as WidgetId));
}

/**
 * Tableros que el usuario ve: LOS MISMOS que la web (`loadUserBoards`, el cuerpo de `getUserBoards`): sus presets, los
 * compartidos con la organización o con él y, si no guardó ninguno, los predefinidos activos. Los widgets del layout se
 * filtran con los permisos del usuario (un tablero compartido puede traer widgets que su rol no ve).
 */
async function loadBoards(ctx: TenantContext, access: DashboardAccess): Promise<DashboardBoard[]> {
  return runInTenantScope(ctx, () =>
    loadUserBoards({ userId: ctx.userId as string, companyId: ctx.companyId }, access.visibleIds)
  );
}

export async function listDashboards(ctx: TenantContext, access: DashboardAccess) {
  const boards = await loadBoards(ctx, access);
  return {
    items: boards.map((board, order) => ({
      key: board.id,
      name: board.name,
      description: board.description,
      order,
      template: board.template,
      scope: !board.isOwner ? ('shared' as const) : board.template !== null && board.visibility === 'private' ? ('default' as const) : ('own' as const),
      ownerName: board.ownerName,
      widgetCount: visibleLayout(board, access).length,
    })),
  };
}

export async function getDashboard(ctx: TenantContext, key: string, access: DashboardAccess) {
  const board = (await loadBoards(ctx, access)).find((item) => item.id === key);
  if (!board) throw new DashboardNotFoundError();

  const layout = visibleLayout(board, access);
  const env = createWidgetEnv(ctx, access);

  // Cada widget aislado (como el `SectionErrorBoundary` de la web): uno que falla no tira el tablero. En paralelo.
  const widgets = await runInTenantScope(ctx, () =>
    Promise.all(
      layout
        .filter((item) => isSupportedWidget(item.widgetId))
        .map(async (item) => {
          const definition = getWidgetDefinition(item.widgetId);
          const base = { id: item.widgetId, title: definition?.title ?? item.widgetId, size: item.size };
          try {
            // Se valida contra el contrato del widget aquí, para que un widget con forma rota falle SOLO él.
            const schema = WIDGET_DATA_SCHEMAS[item.widgetId as keyof typeof WIDGET_DATA_SCHEMAS];
            return { ...base, data: schema.parse(await buildWidgetData(item.widgetId as never, env)) as unknown };
          } catch (error) {
            logger.error('Error al calcular un widget del tablero', { data: { error, widget: item.widgetId } });
            return {
              ...base,
              error: { code: 'WIDGET_ERROR' as const, message: 'No se pudo calcular este widget.' },
            };
          }
        })
    )
  );

  return {
    key: board.id,
    name: board.name,
    description: board.description,
    generatedAt: argentinaDateTime(new Date()),
    widgets,
    unsupportedWidgets: layout
      .filter((item) => !isSupportedWidget(item.widgetId))
      .map((item) => ({ id: item.widgetId, title: access.widgetTitle(item.widgetId) })),
  };
}
