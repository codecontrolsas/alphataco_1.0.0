'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Check, Circle, CircleDashed } from 'lucide-react';
import type { ComputedPosition, DiagramAxle, DiagramPosition } from './tire-diagram-utils';
import { calculatePositions, describePosition } from './tire-diagram-utils';

// Re-export types and utils from the shared (server-safe) module
export { calculatePositions, describePosition, describePositionNumber } from './tire-diagram-utils';
export type { ComputedPosition, DiagramAxle, DiagramPosition } from './tire-diagram-utils';

export interface TireDiagramHitch {
  /** Texto del extremo del chasis, p. ej. "Enganche AB730HJ" o "Tractor AF023BN". */
  label: string;
  /** Extremo donde se conecta: la cabina está adelante, el enganche atrás. */
  position: 'front' | 'rear';
}

// ─── Internal helpers ──────────────────────────────────────────────────────

interface MergedPosition extends ComputedPosition {
  tire_id: string | null;
  tire_serial?: string;
  tire_brand?: string;
  tire_size?: string;
}

function mergePositions(computed: ComputedPosition[], positions: DiagramPosition[]): MergedPosition[] {
  const posMap = new Map<number, DiagramPosition>(positions.map((p) => [p.position_number, p]));

  return computed.map((cp) => {
    const data = posMap.get(cp.position_number);
    return {
      ...cp,
      tire_id: data?.tire_id ?? null,
      tire_serial: data?.tire_serial,
      tire_brand: data?.tire_brand,
      tire_size: data?.tire_size,
    };
  });
}

type PositionState = 'empty' | 'tire' | 'done';

const stateText: Record<PositionState, string> = {
  empty: 'sin cubierta',
  tire: 'con cubierta',
  done: 'intervenida en esta orden',
};

/** Clases por estado: tokens del sistema, el significado nunca va solo por color (ícono + texto). */
const stateClasses: Record<PositionState, { body: string; cap: string }> = {
  empty: {
    body: 'bg-background border-dashed border-muted-foreground/60 text-muted-foreground',
    cap: 'bg-background border-muted-foreground/60',
  },
  tire: {
    body: 'bg-muted border-foreground/40 text-foreground',
    cap: 'bg-muted-foreground/30 border-foreground/40',
  },
  done: {
    body: 'bg-primary/15 border-primary text-primary',
    cap: 'bg-primary/30 border-primary',
  },
};

function StateGlyph({ state, className }: { state: PositionState; className?: string }) {
  if (state === 'done') return <Check className={className} aria-hidden="true" strokeWidth={3} />;
  if (state === 'empty') return <CircleDashed className={className} aria-hidden="true" />;
  return <Circle className={className} aria-hidden="true" />;
}

// ─── TireDrum ──────────────────────────────────────────────────────────────
// Una cubierta vista desde arriba. En modo interactivo es un <button>: foco con
// teclado, Enter/Espacio nativos y nombre accesible completo.

interface TireDrumProps {
  position: MergedPosition;
  interactive: boolean;
  highlighted: boolean;
  selected: boolean;
  onClick?: () => void;
  /** Slightly shorter for dual axles */
  compact?: boolean;
  /** Circular shape for spare tires */
  circular?: boolean;
}

function TireDrum({
  position,
  interactive,
  highlighted,
  selected,
  onClick,
  compact = false,
  circular = false,
}: TireDrumProps) {
  const state: PositionState = highlighted ? 'done' : position.tire_id !== null ? 'tire' : 'empty';
  const colors = stateClasses[state];

  const tireDetail = [
    position.tire_serial ? `cubierta ${position.tire_serial}` : null,
    position.tire_brand,
    position.tire_size,
  ].filter(Boolean);
  const ariaLabel = `${describePosition(position)}: ${
    tireDetail.length > 0 ? tireDetail.join(' ') : stateText[state]
  }${state === 'done' ? ', ' + stateText[state] : ''}${selected ? ', seleccionada' : ''}`;

  const tooltipLines: string[] = [];
  if (position.tire_brand) tooltipLines.push(`Marca: ${position.tire_brand}`);
  if (position.tire_size) tooltipLines.push(`Medida: ${position.tire_size}`);
  if (position.tire_serial) tooltipLines.push(`Serie: ${position.tire_serial}`);
  tooltipLines.push(`Estado: ${stateText[state]}`);

  const focusClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const interactiveClass = interactive
    ? cn('cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow', focusClass)
    : '';
  const selectedClass = selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : '';

  const serialSuffix = position.tire_serial ? position.tire_serial.slice(-4) : null;
  const wrapperClass = circular
    ? cn(
        'flex size-11 select-none flex-col items-center justify-center gap-0.5 rounded-full border-2 font-mono',
        colors.body,
        interactiveClass,
        selectedClass
      )
    : cn(
        'flex select-none flex-row items-center rounded-lg',
        interactive ? (compact ? 'h-8' : 'h-10') : compact ? 'h-5' : 'h-7',
        interactiveClass,
        selectedClass
      );

  const inner = circular ? (
    <>
      <span className="text-xs font-bold leading-none">{position.position_number}</span>
      <StateGlyph state={state} className="size-2.5" />
    </>
  ) : (
    <>
      <span className={cn('h-full w-2 rounded-l-lg border-2 border-r-0', colors.cap)} aria-hidden="true" />
      <span
        className={cn('flex h-full w-11 flex-col items-center justify-center border-y-2 font-mono', colors.body)}
        aria-hidden="true"
      >
        <span className="flex items-center gap-0.5 leading-none">
          <span className={cn('font-bold', compact ? 'text-[10px]' : 'text-xs')}>{position.position_number}</span>
          <StateGlyph state={state} className="size-2.5" />
        </span>
        {serialSuffix && <span className="text-[8px] leading-none opacity-80">{serialSuffix}</span>}
      </span>
      <span className={cn('h-full w-2 rounded-r-lg border-2 border-l-0', colors.cap)} aria-hidden="true" />
    </>
  );

  const content = interactive ? (
    <button
      type="button"
      data-position={position.position_number}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={wrapperClass}
    >
      {inner}
    </button>
  ) : (
    <div role="img" aria-label={ariaLabel} className={wrapperClass}>
      {inner}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold">{describePosition(position)}</p>
          {tooltipLines.map((line) => (
            <p key={line} className="text-xs">
              {line}
            </p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── AxleColumn ─────────────────────────────────────────────────────────────
// Un eje como columna vertical: cubiertas izquierdas arriba, barra, derechas abajo.

interface AxleColumnProps {
  axle: DiagramAxle;
  leftPositions: MergedPosition[];
  rightPositions: MergedPosition[];
  interactive: boolean;
  highlightedPositions: number[];
  selectedPosition: number | null;
  onPositionClick?: (positionNumber: number) => void;
}

function AxleColumn({
  axle,
  leftPositions,
  rightPositions,
  interactive,
  highlightedPositions,
  selectedPosition,
  onPositionClick,
}: AxleColumnProps) {
  const isDual = axle.tires_per_side === 2;

  const renderRow = (list: MergedPosition[]) => (
    <div className={cn('flex flex-col items-center', isDual ? 'gap-1' : '')}>
      {list.map((pos) => (
        <TireDrum
          key={pos.position_number}
          position={pos}
          interactive={interactive}
          highlighted={highlightedPositions.includes(pos.position_number)}
          selected={selectedPosition === pos.position_number}
          onClick={() => onPositionClick?.(pos.position_number)}
          compact={isDual}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-0">
      <span className="mb-1 whitespace-nowrap text-[10px] font-medium text-muted-foreground">
        {axle.is_drive_axle ? 'Tracción · ' : ''}Eje {axle.axle_number}
      </span>
      {renderRow(leftPositions)}
      <div className="min-h-[12px] w-1 flex-1 rounded-full bg-muted-foreground/50" aria-hidden="true" />
      {renderRow(rightPositions)}
    </div>
  );
}

// ─── SpareAxleColumn ────────────────────────────────────────────────────────

interface SpareAxleColumnProps {
  axle: DiagramAxle;
  sparePosition: MergedPosition;
  interactive: boolean;
  highlightedPositions: number[];
  selectedPosition: number | null;
  onPositionClick?: (positionNumber: number) => void;
}

function SpareAxleColumn({
  axle,
  sparePosition,
  interactive,
  highlightedPositions,
  selectedPosition,
  onPositionClick,
}: SpareAxleColumnProps) {
  return (
    <div className="flex flex-col items-center gap-0">
      <span className="mb-1 whitespace-nowrap text-[10px] font-medium text-muted-foreground">
        Eje {axle.axle_number}
      </span>
      <div className="flex flex-1 flex-col items-center justify-center py-2">
        <TireDrum
          position={sparePosition}
          interactive={interactive}
          highlighted={highlightedPositions.includes(sparePosition.position_number)}
          selected={selectedPosition === sparePosition.position_number}
          onClick={() => onPositionClick?.(sparePosition.position_number)}
          circular
        />
        <span className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">Auxilio</span>
      </div>
    </div>
  );
}

// ─── Extremos del chasis ────────────────────────────────────────────────────

function CabinBlock({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-stretch self-stretch py-5">
      <div className="flex w-8 items-center justify-center rounded-l-xl border-2 border-r-0 bg-muted text-[10px] font-medium text-muted-foreground">
        <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{label}</span>
      </div>
    </div>
  );
}

function HitchEnd({ hitch }: { hitch: TireDiagramHitch }) {
  return (
    <div className="flex shrink-0 items-center gap-1 self-center px-1">
      <span className="h-0.5 w-3 bg-muted-foreground/60" aria-hidden="true" />
      <span className="[writing-mode:vertical-rl] whitespace-nowrap rounded border border-dashed bg-background px-0.5 py-1 text-[10px] font-medium text-muted-foreground">
        {hitch.label}
      </span>
    </div>
  );
}
