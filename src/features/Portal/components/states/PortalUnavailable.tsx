import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/shared/components/brand/BrandMark';
import { CircleOff } from 'lucide-react';
import Link from 'next/link';

/** Portal no disponible (módulo apagado o URL inexistente sin sesión): pantalla neutra, sin el marco del portal. */
export function PortalUnavailable() {
  return (
    <main className="bg-background flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <BrandMark size={36} />
      <span
        aria-hidden="true"
        className="bg-muted text-muted-foreground mt-8 flex size-12 items-center justify-center rounded-full"
      >
        <CircleOff className="size-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-balance">Esta página no está disponible</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-pretty">
        La dirección no existe o el portal del empleado no está habilitado para tu empresa. Si creés que es un error,
        consultalo con Recursos Humanos.
      </p>
      <Link href="/portal" className={cn(buttonVariants({ variant: 'outline' }), 'mt-6 min-h-11')}>
        Ir al portal
      </Link>
    </main>
  );
}
