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
 * El layout es síncrono (con `cacheComponents` no puede leer la base fuera de un Suspense), así que no corta por módulo.
 * El corte por el estado del módulo `portal` (F3.6) está en cada entrada: `login` y `activate` por la instancia
 * (`requireInstanceRoute`) y el panel por la empresa del legajo (`PortalPanel`, `requireCompanyRoute`).
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
