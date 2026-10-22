import { IsoFigure } from '@/shared/components/iso/IsoFigure';
import { figureSvgOf } from '../../figures/registry';

/**
 * Figura isométrica del manual. Componente de servidor: el SVG sale de una función pura del
 * registro y no manda JavaScript al cliente. El marco usa solo tokens (borde, fondo de tarjeta,
 * texto atenuado) y ocupa todo el ancho de la guía; el dibujo escala solo, sin scroll horizontal.
 *
 * El pie (`caption`) explica qué mirar: el dibujo casi no lleva texto. Un `name` desconocido no
 * dibuja nada (el validador `manual:check` lo rechaza antes de llegar acá).
 */
export function Figure({ name, caption }: { name: string; caption: string }) {
  const svg = figureSvgOf(name);
  if (!svg) return null;
  return (
    <figure className="mt-6 overflow-hidden border bg-card first:mt-0">
      <IsoFigure svg={svg} className="mx-auto max-w-4xl p-2 sm:p-4" />
      <figcaption className="border-t px-4 py-3 text-sm leading-relaxed text-pretty text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
