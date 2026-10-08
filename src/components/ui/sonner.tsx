'use client';

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Mismo corte que usa sonner para pasar a su layout mobile (ancho completo).
const NARROW_QUERY = '(max-width: 600px)';

function subscribeNarrow(onChange: () => void) {
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const getNarrow = () => window.matchMedia(NARROW_QUERY).matches;
// En SSR vale desktop: el toaster arranca vacío, así que el cambio al hidratar no produce flash.
const getNarrowServer = () => false;

// Las `--normal-*` las lee el CSS inyectado de sonner para el botón de cerrar en oscuro (esa regla no
// depende de `unstyled` y, al no tener capa, le gana a Tailwind): se apuntan a los tokens.
const TOASTER_STYLE = {
  '--width': '360px',
  '--border-radius': '0px',
  '--normal-bg': 'var(--popover)',
  '--normal-bg-hover': 'var(--accent)',
  '--normal-text': 'var(--muted-foreground)',
  '--normal-border': 'var(--border-strong)',
} as React.CSSProperties;

// Estilo propio (sin `richColors`): panel neutro con una barra de 2px del tono a la izquierda.
const TOAST_CLASS_NAMES: NonNullable<ToasterProps['toastOptions']>['classNames'] = {
  toast:
    // font-sans: el <ol> del toaster fija su propia familia. La última clase replica lo que sonner hace en
    // modo estilado: oculta el contenido de los toasts apilados detrás para que no asome.
    'group/toast relative flex w-(--width) items-start gap-2.5 border border-border-strong border-l-2 bg-popover py-2.5 pr-9 pl-3 font-sans text-popover-foreground shadow-overlay data-[expanded=false]:data-[front=false]:*:opacity-0',
  content: 'flex min-w-0 flex-1 flex-col gap-0.5',
  title: 'text-body font-medium',
  description: 'text-caption text-muted-foreground',
  // relative + size-4: el `.sonner-loader` es absoluto y centrado; sin esto se centra en todo el toast.
  icon: 'relative mt-0.5 size-4 shrink-0 [&_svg]:size-4',
  closeButton:
    'absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground',
  actionButton: 'ml-auto h-7 shrink-0 px-2.5 text-label bg-primary text-primary-foreground hover:bg-primary-hover',
  cancelButton: 'h-7 shrink-0 px-2.5 text-label border border-input bg-card hover:bg-accent',
  default: 'border-l-border-strong',
  loading: 'border-l-border-strong',
  success: 'border-l-success [&_[data-icon]]:text-success',
  error: 'border-l-danger [&_[data-icon]]:text-danger',
  warning: 'border-l-warning [&_[data-icon]]:text-warning',
  info: 'border-l-info [&_[data-icon]]:text-info',
};

const TOASTER_ICONS: ToasterProps['icons'] = {
  success: <CircleCheckIcon className="size-4" strokeWidth={1.75} />,
  info: <InfoIcon className="size-4" strokeWidth={1.75} />,
  warning: <TriangleAlertIcon className="size-4" strokeWidth={1.75} />,
  error: <OctagonXIcon className="size-4" strokeWidth={1.75} />,
  loading: <Loader2Icon className="size-4 animate-spin" strokeWidth={1.75} />,
};

/** Único toaster de la app (montado en el root layout). */
const Toaster = ({ ...props }: ToasterProps) => {
  // `resolvedTheme` y no `theme`: `theme` puede valer 'system' y desfasarse de la clase `.dark`.
  const { resolvedTheme } = useTheme();
  const isNarrow = useSyncExternalStore(subscribeNarrow, getNarrow, getNarrowServer);

  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      className="toaster group"
      position={isNarrow ? 'top-center' : 'bottom-right'}
      offset={16}
      // 64 = header de la app (h-14) + 8: no tapa el menú ni el breadcrumb.
      mobileOffset={{ top: 64, left: 16, right: 16 }}
      closeButton
      duration={4000}
      icons={TOASTER_ICONS}
      toastOptions={{ unstyled: true, classNames: TOAST_CLASS_NAMES }}
      style={TOASTER_STYLE}
      {...props}
    />
  );
};

export { Toaster };
