import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import { StateBlock } from '@/shared/components/common/StateBlock';
import type { ReactNode } from 'react';
import { RecordSectionNav, type RecordSectionNavItem } from './components/RecordSectionNav';
import { resolveActiveEntry } from './lib/resolve-active';
import type { ViewDefinition, ViewManagerServerProps } from './types';

/** Una sección de una ficha (legajo, documentación, …). Igual que una vista, con ícono opcional. */
export interface RecordSectionDefinition<M extends ModuleSlug = ModuleSlug> extends ViewDefinition<M> {
  icon?: ReactNode;
}

interface RecordSectionsServerProps<M extends ModuleSlug = ModuleSlug>
  extends Pick<ViewManagerServerProps<M>, 'paramName' | 'searchParams' | 'permissions' | 'ariaLabel'> {
  sections: RecordSectionDefinition<M>[];
  defaultSection: string;
  /** Parámetros que se conservan al cambiar de sección (ej. el id de la ficha); el resto se descarta. */
  preserveParams: string[];
}

/**
 * Navegación propia de las fichas: índice lateral desde `lg` + contenido de la sección activa.
 *
 * Misma resolución que `ViewManagerServer` (permisos por sección, `aliases` para enlaces viejos y
 * una sola sección renderizada), pero con el índice siempre visible a la izquierda en escritorio.
 */
export async function RecordSectionsServer<M extends ModuleSlug = ModuleSlug>({
  paramName,
  sections,
  defaultSection,
  searchParams,
  permissions,
  preserveParams,
  ariaLabel,
}: RecordSectionsServerProps<M>) {
  const resolvedSearchParams = await searchParams;
  const { visible, active } = resolveActiveEntry(
    sections,
    permissions,
    resolvedSearchParams,
    paramName,
    defaultSection
  );

  if (!active) {
    return (
      <StateBlock
        variant="noperm"
        title="Sin acceso"
        description="No tenés permisos para ver ninguna sección de esta ficha."
      />
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

  const items: RecordSectionNavItem[] = visible.map((section) => ({
    value: section.value,
    label: section.label,
    description: section.description,
    icon: section.icon,
    counter: section.counter,
    href: buildHref(section.value),
  }));

  if (visible.length < 2) return <div className="min-w-0">{active.content}</div>;

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <RecordSectionNav items={items} activeValue={active.value} ariaLabel={ariaLabel} />
      <div className="min-w-0">{active.content}</div>
    </div>
  );
}
