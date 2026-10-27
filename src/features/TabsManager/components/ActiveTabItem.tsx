'use client';

import type { ReactNode } from 'react';

/**
 * Centra la pestaña activa dentro de la fila desplazable cuando la fila desborda (móvil): si la activa quedaba a la
 * derecha, fuera de la vista, el usuario no veía en qué pestaña estaba.
 *
 * Es un ref callback, no un efecto: corre al montarse el `<li>` activo. Desplaza SOLO la fila (`scrollLeft` del
 * contenedor), sin `scrollIntoView`, que también movería la página o el contenedor del dashboard.
 */
function scrollActiveIntoRow(node: HTMLLIElement | null): void {
  const row = node?.parentElement;
  if (!node || !row || row.scrollWidth <= row.clientWidth) return;
  const rowRect = row.getBoundingClientRect();
  const itemRect = node.getBoundingClientRect();
  const offset = itemRect.left - rowRect.left - (rowRect.width - itemRect.width) / 2;
  row.scrollLeft += offset;
}

export function ActiveTabItem({ className, children }: { className: string; children: ReactNode }) {
  return (
    <li ref={scrollActiveIntoRow} className={className}>
      {children}
    </li>
  );
}
