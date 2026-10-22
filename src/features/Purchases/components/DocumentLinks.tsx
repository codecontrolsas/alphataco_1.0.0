import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { ReactNode } from 'react';

const LINK_CLASS = 'font-mono text-sm text-brand-ink hover:underline';

/** Número de un documento (solicitud, OC, recepción…) como enlace a su detalle, en las tablas. */
export function DocumentNumberLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn(LINK_CLASS, 'font-medium')}>
      {children}
    </Link>
  );
}

/** Documentos relacionados (varios por fila) como enlaces con su número: `basePath/<id>`. */
export function DocumentLinkList({
  items,
  basePath,
  className,
}: {
  items: ReadonlyArray<{ id: string; number: string }>;
  basePath: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-x-2', className)}>
      {items.map((item) => (
        <Link key={item.id} href={`${basePath}/${item.id}`} className={LINK_CLASS}>
          {item.number}
        </Link>
      ))}
    </div>
  );
}
