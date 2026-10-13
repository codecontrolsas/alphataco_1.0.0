import { cn } from '@/lib/utils';
import * as React from 'react';

/**
 * Layout de dos columnas para formularios: el formulario llena la columna principal y un panel
 * lateral fijo (resumen, completitud, ayuda) ocupa el resto, en vez de un formulario angosto
 * flotando en el medio con los costados vacíos. Debajo de `lg` se apila.
 */
export function SplitLayout({
  main,
  aside,
  className,
}: {
  main: React.ReactNode;
  aside: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]', className)}>
      <div className="min-w-0 space-y-6">{main}</div>
      <aside className="space-y-4 lg:sticky lg:top-20">{aside}</aside>
    </div>
  );
}
