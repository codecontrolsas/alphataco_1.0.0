import { assertPortalEnabledByEnv } from '@/features/Portal/lib/feature-gate';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { default: 'Portal del empleado', template: '%s · Portal del empleado' },
};

/** `viewport-fit=cover` para pintar bajo la muesca (la barra inferior se separa con `env(safe-area-inset-*)`). */
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#12171d' },
  ],
};

/**
 * Todas las rutas del portal pasan por la misma puerta: apagado por la variable, 404. El estado del módulo (F3) lo corta
 * `PortalPanel` con la empresa del legajo y el login; este layout es síncrono y no puede leer la base.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  assertPortalEnabledByEnv();
  return children;
}
