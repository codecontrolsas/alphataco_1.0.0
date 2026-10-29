'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BannerSeverity } from '@/shared/lib/instance-controls-core';
import { Info, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';

/**
 * Banner global de la instancia (lo configura TaskApp): el del login y el del dashboard.
 *
 * - `critical`: `role="alert"` y sin botón de cerrar (no se puede descartar).
 * - `info` / `warning`: `role="status"` y se pueden ocultar. Lo oculto se recuerda en `localStorage` por banner y por
 *   `token` (cambia con el texto o la severidad): un mensaje nuevo vuelve a aparecer. Si el navegador no deja usar
 *   `localStorage` (modo privado, bloqueado) se oculta solo hasta recargar.
 * - La lectura de `localStorage` es una suscripción (`useSyncExternalStore`): en el servidor y en la hidratación el
 *   banner se muestra, y si estaba descartado se oculta enseguida, sin `useEffect` ni desajuste de hidratación.
 */

const STORAGE_PREFIX = 'atq:instance-banner-dismissed:v1:';
const LOCAL_EVENT = 'atq:instance-banner-dismissed';

/** Descartes de esta pestaña cuando `localStorage` no está disponible. */
const memoryDismissed = new Map<string, string>();

function readDismissed(slot: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + slot) ?? memoryDismissed.get(slot) ?? null;
  } catch {
    return memoryDismissed.get(slot) ?? null;
  }
}

function writeDismissed(slot: string, token: string): void {
  memoryDismissed.set(slot, token);
  try {
    window.localStorage.setItem(STORAGE_PREFIX + slot, token);
  } catch {
    // Sin almacenamiento: queda oculto en memoria hasta recargar.
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

const SEVERITY = {
  info: {
    icon: Info,
    label: 'Información',
    tone: 'border-info/30 bg-info-subtle text-info-subtle-foreground',
  },
  warning: {
    icon: TriangleAlert,
    label: 'Aviso',
    tone: 'border-warn/40 bg-warn-subtle text-warn-subtle-foreground',
  },
  critical: {
    icon: OctagonAlert,
    label: 'Aviso importante',
    tone: 'border-danger/30 bg-danger-subtle text-danger-subtle-foreground',
  },
} as const satisfies Record<BannerSeverity, { icon: unknown; label: string; tone: string }>;

interface InstanceBannerProps {
  /** Qué banner es (`login` / `dashboard`): separa lo descartado de uno y otro. */
  slot: 'login' | 'dashboard';
  message: string;
  severity: BannerSeverity;
  /** Huella del mensaje (`bannerDismissToken`), calculada en el servidor. */
  token: string;
  /** `bar`: franja de ancho completo (dashboard). `card`: recuadro dentro de la columna del login. */
  layout: 'bar' | 'card';
}

export function InstanceBanner({ slot, message, severity, token, layout }: InstanceBannerProps) {
  const dismissedToken = useSyncExternalStore(
    subscribe,
    () => readDismissed(slot),
    () => null
  );
  const dismissible = severity !== 'critical';
  if (dismissible && dismissedToken === token) return null;

  const { icon: Icon, label, tone } = SEVERITY[severity];

  return (
    <div
      role={severity === 'critical' ? 'alert' : 'status'}
      data-slot="instance-banner"
      data-severity={severity}
      className={cn(
        'flex items-start gap-3 text-sm',
        tone,
        layout === 'bar' ? 'border-b px-4 py-2.5 sm:px-8' : 'rounded-xl border px-4 py-3'
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-relaxed break-words whitespace-pre-line">
        <span className="sr-only">{label}: </span>
        {message}
      </p>
      {dismissible && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => writeDismissed(slot, token)}
          aria-label="Ocultar aviso"
          className="-my-0.5 -mr-1 shrink-0 text-current hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
