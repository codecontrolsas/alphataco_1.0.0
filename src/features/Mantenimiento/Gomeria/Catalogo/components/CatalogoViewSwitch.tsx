'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';

/** La estantería no es lo primero de la pantalla: su código (kit isométrico) se baja recién al abrirla. */
const TireRack = dynamic(() => import('./iso/TireRack'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

type CatalogoView = 'table' | 'rack';

const VIEWS: { id: CatalogoView; label: string }[] = [
  { id: 'table', label: 'Tabla' },
  { id: 'rack', label: 'Estantería' },
];

interface CatalogoViewSwitchProps {
  paramNamespace: string;
  /** La tabla del catálogo: sigue montada en las dos vistas, es la herramienta de trabajo y la que recibe el filtro. */
  children: ReactNode;
}

/** Selector Tabla / Estantería. La estantería se suma ARRIBA de la tabla, que queda filtrada por lo que se toque. */
export function CatalogoViewSwitch({ paramNamespace, children }: CatalogoViewSwitchProps) {
  const [view, setView] = useState<CatalogoView>('table');

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Vista del catálogo" className="flex gap-1.5">
        {VIEWS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={view === item.id ? 'secondary' : 'outline'}
            aria-pressed={view === item.id}
            className="h-8"
            onClick={() => setView(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {view === 'rack' && <TireRack paramNamespace={paramNamespace} />}
      {children}
    </div>
  );
}
