import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { ViewNav, type ViewNavItem } from './components/ViewNav';
import { resolveActiveEntry } from './lib/resolve-active';
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

  const buildHref = (value: string) => {
    const params = new URLSearchParams();
    for (const key of preserveParams) {
      const current = resolvedSearchParams[key];
      if (typeof current === 'string') params.set(key, current);
    }
    params.set(paramName, value);
    return `?${params.toString()}`;
  };

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
