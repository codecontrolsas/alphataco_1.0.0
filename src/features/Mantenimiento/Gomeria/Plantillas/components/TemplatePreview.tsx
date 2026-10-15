'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { DiagramAxle } from '@/features/Mantenimiento/Gomeria/shared/TireDiagramRenderer';
import { describeTemplateLayout, inferTemplateLayout } from '@/features/Mantenimiento/Gomeria/shared/iso/axle-layout';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

// Figura isométrica: se carga bajo demanda y solo en el cliente (no pesa en el resto de la pantalla).
const TireDiagramIso = dynamic(
  () => import('@/features/Mantenimiento/Gomeria/shared/iso/TireDiagramIso').then((m) => m.TireDiagramIso),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full rounded-xl" /> }
);

interface TemplatePreviewProps {
  axles: DiagramAxle[];
}

/**
 * Vista previa de una configuración de ejes. Se redibuja sola al agregar, quitar o cambiar un eje o un
 * auxilio, y la carrocería, la distancia entre ejes y el enganche salen de cómo se arma ese vehículo
 * (ver `inferTemplateLayout`). Sin estados de color: es solo la forma.
 */
export function TemplatePreview({ axles }: TemplatePreviewProps) {
  const layout = useMemo(() => inferTemplateLayout(axles), [axles]);

  if (!layout) {
    return (
      <p className="text-muted-foreground text-sm italic">
        Agregá al menos un eje para ver la vista previa del vehículo.
      </p>
    );
  }

  const summary = describeTemplateLayout(layout);

  return (
    <figure className="space-y-2">
      <div
        // La forma cambia al armar la configuración: un fundido corto marca el cambio sin distraer.
        key={`${layout.kind}-${layout.counts.axles}-${layout.counts.spares}-${axles.map((a) => `${a.tires_per_side}${a.is_drive_axle ? 'd' : ''}`).join('')}`}
        className="animate-in fade-in-0 duration-300 motion-reduce:animate-none"
      >
        <TireDiagramIso
          axles={axles}
          interactive={false}
          label={`Vista previa: ${summary}`}
          cabinLabel={layout.cabinLabel}
          hitch={layout.hitch}
          body={layout.body}
          axleGaps={layout.axleGaps}
        />
      </div>
      <figcaption className="text-muted-foreground text-center text-xs tabular-nums" aria-live="polite">
        {summary}
      </figcaption>
    </figure>
  );
}
