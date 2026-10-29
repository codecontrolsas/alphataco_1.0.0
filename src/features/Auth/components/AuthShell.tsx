import { AuthInstanceNotices } from '@/features/InstanceControls/components/AuthInstanceNotices';
import { BrandMark } from '@/shared/components/brand/BrandMark';
import { BRAND_NAME } from '@/shared/lib/branding';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthProductPanel } from './AuthProductPanel';

interface AuthShellProps {
  /** Etiqueta corta sobre el título (ej. "Acceso"). */
  kicker: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Pantalla de acceso compartida por el login, la recuperación y los accesos de operario e
 * indumentaria: formulario a la izquierda y panel de producto a la derecha (sólo en pantallas
 * anchas). Sin tarjeta alrededor del formulario: el espacio en blanco hace de contenedor.
 */
export function AuthShell({ kicker, title, description, children }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[5fr_6fr]">
      <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-12 sm:py-8">
        <header>
          <Link href="/" className="inline-flex items-center gap-2.5 text-xl font-bold lowercase">
            <BrandMark size={30} />
            {BRAND_NAME}
          </Link>
        </header>

        <main className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-sm py-12">
            {/* Pausa del sistema y banner del login (TaskApp): dato por request, no bloquea el resto de la pantalla. */}
            <Suspense fallback={null}>
              <AuthInstanceNotices />
            </Suspense>
            <p className="text-brand-ink mb-3 flex items-center gap-2 font-mono text-xs font-medium tracking-wider uppercase before:h-px before:w-4 before:bg-current">
              {kicker}
            </p>
            <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">{title}</h1>
            {description && <p className="text-muted-foreground mt-2 text-pretty">{description}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </main>

        <footer className="text-muted-foreground border-t pt-5 text-sm">© {BRAND_NAME}</footer>
      </div>

      <AuthProductPanel />
    </div>
  );
}
