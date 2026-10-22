import type { AllTabSlugsUnion, ModuleSlug } from '@/features/Permissions/permissions-map';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import type { TabDefinition } from './types';

interface SectionTabConfig<M extends ModuleSlug> {
  moduleSlug: M;
  /** Slug del permiso de la sección; también es su valor en la URL (`?tab=`) salvo que se indique `value`. */
  tabSlug: AllTabSlugsUnion<M> & string;
  value?: string;
  icon: LucideIcon;
  text: string;
  /** Título del error de la sección; por defecto "No se pudo mostrar <text>". */
  errorTitle?: string;
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Sección de un módulo para `SectionManagerServer`: etiqueta con ícono y contenido aislado con su
 * propio límite de error y `Suspense` (una sección que falla o tarda no frena a las demás).
 */
export function sectionTab<M extends ModuleSlug>({
  moduleSlug,
  value,
  tabSlug,
  icon: Icon,
  text,
  errorTitle,
  fallback,
  children,
}: SectionTabConfig<M>): TabDefinition<M> {
  return {
    value: value ?? tabSlug,
    label: (
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {text}
      </span>
    ),
    moduleSlug,
    tabSlug,
    content: (
      <SectionErrorBoundary title={errorTitle ?? `No se pudo mostrar ${text}`}>
        <Suspense fallback={fallback}>{children}</Suspense>
      </SectionErrorBoundary>
    ),
  };
}
