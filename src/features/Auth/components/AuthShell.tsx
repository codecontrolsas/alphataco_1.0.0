import { BRAND_NAME } from '@/shared/lib/branding';
import Link from 'next/link';
import packageJson from '../../../../package.json';

// Se resuelve en el servidor: al cliente solo llega el string de la versión en el HTML.
const APP_VERSION = packageJson.version;

interface AuthShellProps {
  children: React.ReactNode;
}

/**
 * Layout partido de login y recupero de contraseña: panel de marca (40%, solo `lg`) + formulario.
 *
 * El panel es `bg-foreground` en claro y `bg-card` en oscuro, con tokens: no lee la cookie de
 * tema (reemplaza al banner anterior, que la leía en el server y la corregía con un refresh).
 * La "firma técnica" muestra solo la versión: empresa y estado del sistema no tienen una fuente
 * real antes del login.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <aside className="relative hidden flex-col justify-between bg-foreground p-10 text-background shadow-[inset_0_2px_0_var(--primary)] lg:flex dark:bg-card dark:text-foreground">
        <Link href="/" className="text-section lowercase">
          {BRAND_NAME}
        </Link>
        <p className="max-w-sm text-page-title text-balance">Gestión operativa de personal, equipos y documentación</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-caption tabular-nums opacity-80">
          <dt>Versión</dt>
          <dd>{APP_VERSION}</dd>
        </dl>
      </aside>
      <div className="flex min-w-0 flex-col px-4 py-10 sm:px-10 lg:px-24 lg:py-24">
        <Link href="/" className="mb-10 text-section lowercase text-primary-text lg:hidden">
          {BRAND_NAME}
        </Link>
        <div className="w-full max-w-[360px]">{children}</div>
      </div>
    </main>
  );
}
