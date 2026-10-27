import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import { cn } from '@/lib/utils';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { ViewNav, type ViewNavItem } from './components/ViewNav';
import { ViewTabs } from './components/ViewTabs';
import { buildEntryHref, resolveActiveEntry } from './lib/resolve-active';
import type { ViewManagerServerProps } from './types';

/**
 * ViewManagerServer — monta UNA vista de una sección (la activa según `?<paramName>=`).
 *
 * Los enlaces conservan solo `preserveParams` (default `['tab']`) para no arrastrar los
 * filtros de la DataTable de otra vista. Las vistas inactivas no se renderizan.
 */
export async function ViewManagerServer<M extends ModuleSlug = ModuleSlug>({
  paramName,
  views,
  defaultView,
  searchParams,
  permissions,
  preserveParams = ['tab'],
  layout = 'menu',
  tabsLevel = 'primary',
  ariaLabel,
  actions,
}: ViewManagerServerProps<M>) {
  const resolvedSearchParams = await searchParams;
  const { visible, active } = resolveActiveEntry(views, permissions, resolvedSearchParams, paramName, defaultView);

  if (!active) {
    return (
      <StateBlock variant="noperm" title="Sin acceso" description="No tenés permisos para ver ninguna vista acá." />
    );
  }

  const buildHref = (value: string) => buildEntryHref(resolvedSearchParams, preserveParams, paramName, value);

  const items: ViewNavItem[] = visible.map((view) => ({
    value: view.value,
    label: view.label,
    description: view.description,
    counter: view.value === active.value ? view.counter : undefined,
    href: buildHref(view.value),
    aliases: view.aliases,
  }));

  const showNav = visible.length > 1;

  const content = active.surface ? (
    <SectionCard className="@container min-w-0">{active.content}</SectionCard>
  ) : (
    active.content
  );

  if (layout === 'tabs') {
    const primary = tabsLevel === 'primary';
    // Con una sola vista no hay pestañas: igual se muestra su descripción para dar contexto.
    const description = primary ? visible.find((view) => view.value === active.value)?.description : undefined;
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {showNav || actions ? (
          <div
            className={cn(
              'flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between',
              // Primer nivel: la fila queda fija bajo el header del dashboard (h-14) y ocupa todo el ancho
              // del área de contenido (compensa el `px-4 sm:px-8` del layout).
              primary &&
                'bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-14 z-10 -mx-4 border-b px-4 backdrop-blur sm:-mx-8 sm:px-8'
            )}
          >
            {showNav ? (
              <ViewTabs items={items} activeValue={active.value} ariaLabel={ariaLabel} level={tabsLevel} />
            ) : (
              <span />
            )}
            {actions ? <div className="flex flex-wrap items-center gap-2 pb-2">{actions}</div> : null}
          </div>
        ) : null}
        {description ? <p className="text-muted-foreground -mt-1 text-sm text-pretty">{description}</p> : null}
        {content}
      </div>
    );
  }

  if (layout === 'rail') {
    return (
      <div className="flex min-w-0 flex-col gap-6 2xl:flex-row">
        {showNav ? (
          <div className="flex shrink-0 items-start justify-between gap-3 2xl:block">
            <ViewNav items={items} activeValue={active.value} ariaLabel={ariaLabel} layout="rail" />
            {actions ? <div className="flex flex-wrap items-center gap-2 2xl:hidden">{actions}</div> : null}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {actions && !showNav ? <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div> : null}
          {actions && showNav ? (
            <div className="mb-4 hidden flex-wrap justify-end gap-2 2xl:flex">{actions}</div>
          ) : null}
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {showNav || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {showNav ? (
            <ViewNav items={items} activeValue={active.value} ariaLabel={ariaLabel} layout="menu" />
          ) : (
            <span />
          )}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {content}
    </div>
  );
}
