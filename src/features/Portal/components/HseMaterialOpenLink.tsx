'use client';

import { markHseMaterialOpened } from '@/features/Portal/actions/hse-trainings.server';
import type { ReactNode } from 'react';

/**
 * Enlace a un material que, al abrirlo, deja la marca de apertura (tiempo de estudio). Es un `<a>` de verdad: si la
 * marca falla o tarda, el archivo se abre igual. Solo registra mientras el material no está leído (después ya no
 * aporta a la medición).
 */
export function HseMaterialOpenLink({
  materialId,
  href,
  className,
  newTab = false,
  trackOpen,
  children,
}: {
  materialId: string;
  href: string;
  className?: string;
  newTab?: boolean;
  trackOpen: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={() => {
        if (trackOpen) void markHseMaterialOpened({ materialId }).catch(() => undefined);
      }}
    >
      {children}
    </a>
  );
}
