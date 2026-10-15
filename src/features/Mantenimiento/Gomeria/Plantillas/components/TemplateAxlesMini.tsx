import { cn } from '@/lib/utils';

interface MiniAxle {
  id: string;
  axle_number: number;
  tires_per_side: number;
  is_spare: boolean;
}

/** Cubierta del dibujo: un rectángulo vertical, como en la vista superior de la orden. */
function Tire({ className }: { className?: string }) {
  return <span className={cn('bg-muted-foreground/60 block h-3.5 w-2 rounded-[2px]', className)} />;
}

/**
 * Mini diagrama de ejes de una plantilla (vista superior): una fila por eje con sus cubiertas a cada lado y
 * el auxilio aparte. Es decorativo (`aria-hidden`): la cantidad de ejes y posiciones se dice en texto.
 */
export function TemplateAxlesMini({ axles }: { axles: MiniAxle[] }) {
  const regular = axles.filter((axle) => !axle.is_spare).sort((a, b) => a.axle_number - b.axle_number);
  const spare = axles.filter((axle) => axle.is_spare);

  if (axles.length === 0) {
    return <span className="text-muted-foreground text-xs italic">Sin ejes</span>;
  }

  return (
    <span aria-hidden="true" className="flex shrink-0 flex-col items-center gap-1 py-0.5">
      {regular.map((axle) => (
        <span key={axle.id} className="flex items-center gap-1">
          <span className="flex gap-0.5">
            {Array.from({ length: axle.tires_per_side }).map((_, index) => (
              <Tire key={index} />
            ))}
          </span>
          <span className="bg-border h-0.5 w-8 rounded-full" />
          <span className="flex gap-0.5">
            {Array.from({ length: axle.tires_per_side }).map((_, index) => (
              <Tire key={index} />
            ))}
          </span>
        </span>
      ))}
      {spare.length > 0 ? (
        <span className="flex items-center gap-0.5">
          {spare.map((axle) => (
            <Tire key={axle.id} className="rounded-full" />
          ))}
        </span>
      ) : null}
    </span>
  );
}
