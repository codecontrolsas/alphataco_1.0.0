import { cn } from '@/lib/utils';
import type { OrderStage, OrderStageState } from '../../lib/order-stages';

export type StageBarStage = Pick<OrderStage, 'label' | 'meta' | 'state'> & { key: string };

const STATE_LABELS: Record<OrderStageState, string> = {
  done: 'completada',
  current: 'etapa actual',
  pending: 'pendiente',
  rejected: 'rechazada',
};

const BAR_STYLES: Record<OrderStageState, string> = {
  done: 'bg-ok',
  current: 'bg-brand',
  pending: 'bg-muted',
  rejected: 'bg-danger',
};

const TEXT_STYLES: Record<OrderStageState, string> = {
  done: 'text-ok-subtle-foreground',
  current: 'text-brand-subtle-foreground font-semibold',
  pending: 'text-muted-foreground',
  rejected: 'text-danger-subtle-foreground font-semibold',
};

interface StageBarProps {
  stages: StageBarStage[];
}

/** Recorrido de la orden por sus etapas (Solicitud → Validación). 6 columnas; 3 en móvil. */
export function StageBar({ stages }: StageBarProps) {
  return (
    <ol
      aria-label="Recorrido de la orden"
      className="grid grid-cols-3 gap-2 md:auto-cols-fr md:grid-flow-col"
    >
      {stages.map((stage) => (
        <li
          key={stage.key}
          aria-current={stage.state === 'current' || stage.state === 'rejected' ? 'step' : undefined}
          className={cn('flex min-w-0 flex-col gap-1.5 text-[12.5px]', TEXT_STYLES[stage.state])}
        >
          <span aria-hidden="true" className={cn('block h-1.5 rounded-sm', BAR_STYLES[stage.state])} />
          <span className="truncate">
            {stage.label}
            <span className="sr-only">: {STATE_LABELS[stage.state]}</span>
          </span>
          {stage.meta ? <small className="truncate font-mono text-[11.5px] font-medium">{stage.meta}</small> : null}
        </li>
      ))}
    </ol>
  );
}
