import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface DataListItem {
  key: string;
  /** Destino del renglón: todo el renglón es el enlace (área táctil grande). Sin `href`, es solo informativo. */
  href?: string;
  title: ReactNode;
  /** Línea secundaria (tipo, versión, fechas…). */
  meta?: ReactNode;
  /** Estado o dato clave: debajo del título en el celular, a la derecha desde `sm`. */
  aside?: ReactNode;
  /** Ícono o marca a la izquierda (decorativo). */
  leading?: ReactNode;
}

/**
 * Lista de datos responsive: en el celular cada renglón es una tarjeta apilada; desde `sm` es una fila con el estado a
 * la derecha, dentro de un solo contenedor con separadores (la "tabla" del portal sin scroll horizontal). Para listas
 * cortas del empleado; los listados grandes con filtros del dashboard siguen siendo DataTable.
 */
export function DataList({
  items,
  label,
  className,
}: {
  items: DataListItem[];
  /** Nombre accesible de la lista (si no la etiqueta un título cercano). */
  label?: string;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={cn('bg-card divide-y overflow-hidden rounded-xl border', className)}>
      {items.map((item) => {
        const body = (
          <>
            {item.leading && (
              <span aria-hidden="true" className="text-muted-foreground mt-0.5 shrink-0">
                {item.leading}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="min-w-0 space-y-0.5">
                <span className="block font-medium text-pretty break-words">{item.title}</span>
                {item.meta && <span className="text-muted-foreground block text-sm text-pretty">{item.meta}</span>}
              </span>
              {item.aside && <span className="flex shrink-0 flex-wrap items-center gap-2">{item.aside}</span>}
            </span>
            {item.href && (
              <ChevronRight aria-hidden="true" className="text-muted-foreground mt-0.5 size-5 shrink-0 sm:mt-0" />
            )}
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className="hover:bg-muted/40 focus-visible:ring-ring flex min-h-16 items-start gap-3 p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset motion-reduce:transition-none sm:items-center"
              >
                {body}
              </Link>
            ) : (
              <div className="flex min-h-16 items-start gap-3 p-4 sm:items-center">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
