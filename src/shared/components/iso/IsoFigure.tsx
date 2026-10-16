'use client';

import { cn } from '@/lib/utils';
import { memo, useMemo } from 'react';
import './iso.css';

interface IsoFigureProps {
  /** SVG completo ya generado con `figureSvg` (strings del kit; nunca interpolar texto del usuario sin escapar). */
  svg: string;
  className?: string;
}

/**
 * Contenedor de una figura isométrica: el SVG se arma con funciones puras del kit y la interacción la agrega
 * `useIsoSelect` en el componente que lo envuelve.
 *
 * React 19 vuelve a escribir el `innerHTML` en cada render si el objeto de `dangerouslySetInnerHTML` es nuevo,
 * aunque el texto sea igual: reemplazaba el SVG al pasar el mouse y se perdían el foco y los clics. El objeto va
 * memorizado por `svg`, así el DOM solo se reemplaza cuando la figura cambia de verdad.
 */
function IsoFigureBase({ svg, className }: IsoFigureProps) {
  const html = useMemo(() => ({ __html: svg }), [svg]);
  return <div className={cn('iso w-full', className)} dangerouslySetInnerHTML={html} />;
}

export const IsoFigure = memo(IsoFigureBase);
