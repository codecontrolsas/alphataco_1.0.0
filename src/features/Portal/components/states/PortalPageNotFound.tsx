import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '../ui/EmptyState';

/** Dentro del panel: lo pedido no existe, ya no te corresponde (otra versión, te cambiaron de puesto) o no es tuyo. */
export function PortalPageNotFound() {
  return (
    <div className="py-6">
      <EmptyState
        icon={SearchX}
        headingLevel="h1"
        title="No encontramos lo que buscabas"
        description="Puede que ya no te corresponda (por ejemplo, salió una versión nueva) o que la dirección esté mal escrita."
        action={
          <Link href="/portal" className={cn(buttonVariants(), 'min-h-11')}>
            Volver al inicio
          </Link>
        }
      />
    </div>
  );
}
