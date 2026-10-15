import { Button } from '@/components/ui/button';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Marco de las páginas de alta/edición/detalle de Compras: enlace de volver y, si hay título, cabecera. */
export function PurchasesPageShell({
  title,
  back,
  children,
}: {
  title?: string;
  back: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={back.href}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      </Button>
      {title && <RecordHeader identity={<h1 className="text-2xl font-semibold">{title}</h1>} />}
      {children}
    </div>
  );
}
