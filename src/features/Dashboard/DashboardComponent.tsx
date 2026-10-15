import {
  DashboardBoard,
  type BoardWidgetSlot,
  type CatalogWidget,
} from '@/features/Dashboard/Boards/components/_DashboardBoard';
import { BOARD_PARAM } from '@/features/Dashboard/Boards/lib/board-layout';
import { getUserBoards, getVisibleWidgetIds } from '@/features/Dashboard/Boards/lib/boards.server';
import { renderWidget } from '@/features/Dashboard/Boards/lib/widget-render';
import { findActiveBoardIndex } from '@/features/Dashboard/lib/board-nav';
import { WIDGETS, getWidgetDefinition, type WidgetId } from '@/features/Dashboard/lib/widget-registry';
import { ChartColorVars } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { ViewNav } from '@/features/TabsManager/components/ViewNav';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StateBlock } from '@/shared/components/common/StateBlock';

type SearchParams = { [key: string]: string | string[] | undefined };

const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Dashboard personalizable: tableros por usuario y empresa armados con los widgets del registro
 * (`lib/widget-registry.ts`) que el usuario puede ver según sus permisos.
 *
 * Server-first: los widgets del tablero activo se renderizan acá (cada uno con su Suspense) y el
 * cliente (`DashboardBoard`) solo maneja orden, ancho y edición. Los widgets de un layout guardado
 * que ya no existen o que el usuario dejó de poder ver se omiten sin aviso ni ceros.
 */
export default async function DashboardComponent({ searchParams }: { searchParams: SearchParams }) {
  const [boards, visible] = await Promise.all([getUserBoards(), getVisibleWidgetIds()]);

  if (visible.size === 0 || boards.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Dashboard" />
        <StateBlock
          variant="noperm"
          title="No tenés indicadores habilitados"
          description="Los widgets del Dashboard se muestran según los módulos que tengas habilitados en tus permisos."
        />
      </div>
    );
  }

  // Tablero activo: `?tablero=`; si no, el equivalente de un link viejo `?tab=`/`?subtab=`; si no, el primero.
  // La misma regla marca el acceso activo del sidebar y la miga de pan (`lib/board-nav.ts`).
  const activeIndex = findActiveBoardIndex(boards, {
    board: firstValue(searchParams[BOARD_PARAM]),
    tab: firstValue(searchParams.tab),
    subtab: firstValue(searchParams.subtab),
  });
  const active = boards[activeIndex];

  const slots: BoardWidgetSlot[] = active.layout.flatMap((item) => {
    const widget = getWidgetDefinition(item.widgetId);
    if (!widget || !visible.has(widget.id as WidgetId)) return [];
    return [{ widgetId: widget.id, size: item.size, node: renderWidget(widget, searchParams) }];
  });

  const catalog: CatalogWidget[] = WIDGETS.filter((widget) => visible.has(widget.id)).map((widget) => ({
    id: widget.id,
    title: widget.title,
    description: widget.description,
    section: widget.section,
    defaultSize: widget.defaultSize,
    minSize: widget.minSize,
    maxSize: widget.maxSize,
  }));

  const widgetCount = `${slots.length} ${slots.length === 1 ? 'widget' : 'widgets'}`;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title={active.name} meta={widgetCount} description={active.description ?? undefined} />

      {/* `data-dashboard-colors`: ancestro común de todos los gráficos y KPI (variables --dash-*). */}
      <section data-dashboard-colors="" aria-label={`Tablero ${active.name}`} className="min-w-0">
        <ChartColorVars />
        <DashboardBoard
          key={active.id}
          board={{ id: active.id, name: active.name, persisted: active.persisted }}
          canMoveUp={activeIndex > 0}
          canMoveDown={activeIndex < boards.length - 1}
          slots={slots}
          catalog={catalog}
          startEditing={firstValue(searchParams.personalizar) === '1'}
          selector={
            boards.length > 1 ? (
              <ViewNav
                layout="menu"
                menuPrefix="Tablero"
                ariaLabel="Tableros"
                activeValue={active.id}
                items={boards.map((board) => ({
                  value: board.id,
                  label: board.name,
                  description:
                    board.description ?? `${board.layout.length} ${board.layout.length === 1 ? 'widget' : 'widgets'}`,
                  href: `/dashboard?${BOARD_PARAM}=${encodeURIComponent(board.id)}`,
                }))}
              />
            ) : null
          }
        />
      </section>
    </div>
  );
}
