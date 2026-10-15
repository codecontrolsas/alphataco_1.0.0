import { cn } from '@/lib/utils';
import './iso.css';

interface IsoFigureProps {
  /** SVG completo ya generado con `figureSvg` (strings del kit; nunca interpolar texto del usuario sin escapar). */
  svg: string;
  className?: string;
}

/**
 * Contenedor de una figura isométrica. Es un componente de servidor: el SVG se arma al renderizar
 * con funciones puras del kit y no manda JS al cliente. La interacción, si hay, la agrega
 * `useIsoSelect` en un componente cliente que envuelve a este.
 */
export function IsoFigure({ svg, className }: IsoFigureProps) {
  return <div className={cn('iso w-full', className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}
