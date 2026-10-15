'use client';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

// En el servidor (y en la hidratación) se asume pantalla chica: apilado, sin paneles redimensionables.
function getServerSnapshot() {
  return false;
}

interface CatalogSplitLayoutProps {
  /** Formulario de alta/edición del catálogo. */
  form: ReactNode;
  /** Tabla del catálogo. */
  table: ReactNode;
}

/**
 * Formulario + tabla de un catálogo de Configuración.
 * Desde `lg` (1024 px) se muestran lado a lado en paneles redimensionables; por debajo se apilan
 * (formulario arriba, tabla abajo) porque un panel al 30 % de 390 px no es usable.
 */
export function CatalogSplitLayout({ form, table }: CatalogSplitLayoutProps) {
  const isDesktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!isDesktop) {
    return (
      <div className="flex w-full flex-col gap-6">
        <div>{form}</div>
        <div className="min-w-0">{table}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResizablePanelGroup className="min-h-[400px]" direction="horizontal">
        <ResizablePanel defaultSize={30}>
          <div className="h-full overflow-auto pr-2">{form}</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70}>
          <div className="h-full overflow-auto pl-2">{table}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
