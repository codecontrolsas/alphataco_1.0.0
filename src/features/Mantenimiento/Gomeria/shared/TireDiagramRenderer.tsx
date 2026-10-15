'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

export interface TireDiagramRendererProps {
  axles: DiagramAxle[];
  positions?: DiagramPosition[];
  interactive?: boolean;
  onPositionClick?: (positionNumber: number) => void;
  highlightedPositions?: number[];
  /** Posición abierta en el panel: se marca con `aria-pressed` y un anillo de foco fijo. */
  selectedPosition?: number | null;
  /** e.g. vehicle domain/plate */
  label?: string;
  /** Texto del bloque de cabina (vista superior). Si no viene, no se dibuja. */
  cabinLabel?: string;
  /** Extremo de conexión con otro vehículo. */
  hitch?: TireDiagramHitch;
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

// ─── Main Component ────────────────────────────────────────────────────────

export function TireDiagramRenderer({
  axles,
  positions = [],
  interactive = false,
  onPositionClick,
  highlightedPositions = [],
  selectedPosition = null,
  label,
  cabinLabel,
  hitch,
}: TireDiagramRendererProps) {
  const computed = calculatePositions(axles);
  const merged = mergePositions(computed, positions);

  // Sort ALL axles by axle_number — render in order (regular + spare interleaved)
  const sortedAxles = [...axles].sort((a, b) => a.axle_number - b.axle_number);
  const regularAxles = sortedAxles.filter((a) => !a.is_spare);

  // Group regular merged positions by axle_number and side
  const byAxle = new Map<number, { left: MergedPosition[]; right: MergedPosition[] }>();
  for (const pos of merged) {
    if (pos.side === 'SPARE') continue;
    if (!byAxle.has(pos.axle_number)) {
      byAxle.set(pos.axle_number, { left: [], right: [] });
    }
    const group = byAxle.get(pos.axle_number)!;
    if (pos.side === 'LEFT') group.left.push(pos);
    else group.right.push(pos);
  }

  // Group spare merged positions by axle_number
  const bySpareAxle = new Map<number, MergedPosition>();
  for (const pos of merged) {
    if (pos.side === 'SPARE') {
      bySpareAxle.set(pos.axle_number, pos);
    }
  }

  const withTire = positions.filter((p) => p.tire_id !== null).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto flex max-w-3xl flex-col gap-2" role="group" aria-label={label ?? 'Diagrama de cubiertas'}>
        {label && <div className="text-sm font-medium text-muted-foreground">{label}</div>}

        {/* Leyenda: ícono + texto, nunca solo color */}
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex h-4 w-6 items-center justify-center rounded-sm border-2',
                stateClasses.tire.body
              )}
            >
              <StateGlyph state="tire" className="size-2.5" />
            </span>
            Con cubierta
          </li>
          <li className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex h-4 w-6 items-center justify-center rounded-sm border-2',
                stateClasses.empty.body
              )}
            >
              <StateGlyph state="empty" className="size-2.5" />
            </span>
            Sin cubierta
          </li>
          {highlightedPositions.length > 0 && (
            <li className="flex items-center gap-1">
              <span
                className={cn(
                  'inline-flex h-4 w-6 items-center justify-center rounded-sm border-2',
                  stateClasses.done.body
                )}
              >
                <StateGlyph state="done" className="size-2.5" />
              </span>
              Intervenida
            </li>
          )}
        </ul>

        {/* Diagrama (vista superior, el vehículo avanza hacia la izquierda: cabina primero) */}
        <div className="flex w-full flex-row items-center overflow-x-auto pb-1">
          <div className="flex shrink-0 flex-col items-center justify-center pr-2 text-xs text-muted-foreground">
            <span aria-hidden="true">←</span>
            <span className="whitespace-nowrap">Frente</span>
          </div>

          {regularAxles.length > 0 && (
            <div className="flex shrink-0 flex-col justify-between py-6 pr-1.5 text-[10px] text-muted-foreground">
              <span className="whitespace-nowrap">Izq</span>
              <span className="whitespace-nowrap">Der</span>
            </div>
          )}

          {cabinLabel && <CabinBlock label={cabinLabel} />}
          {hitch?.position === 'front' && <HitchEnd hitch={hitch} />}

          {sortedAxles.length > 0 && (
            <div className="relative flex min-h-[11rem] min-w-0 flex-1 flex-row items-stretch justify-around rounded-xl border-2 bg-muted/40 px-3 py-5">
              <div className="absolute left-4 right-4 top-0 h-0.5 rounded-full bg-border" aria-hidden="true" />
              <div className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-border" aria-hidden="true" />

              {sortedAxles.map((axle) => {
                if (axle.is_spare) {
                  const sparePos = bySpareAxle.get(axle.axle_number);
                  if (!sparePos) return null;
                  return (
                    <SpareAxleColumn
                      key={axle.id}
                      axle={axle}
                      sparePosition={sparePos}
                      interactive={interactive}
                      highlightedPositions={highlightedPositions}
                      selectedPosition={selectedPosition}
                      onPositionClick={onPositionClick}
                    />
                  );
                }
                const group = byAxle.get(axle.axle_number) ?? { left: [], right: [] };
                return (
                  <AxleColumn
                    key={axle.id}
                    axle={axle}
                    leftPositions={group.left}
                    rightPositions={group.right}
                    interactive={interactive}
                    highlightedPositions={highlightedPositions}
                    selectedPosition={selectedPosition}
                    onPositionClick={onPositionClick}
                  />
                );
              })}
            </div>
          )}

          {hitch?.position === 'rear' && <HitchEnd hitch={hitch} />}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {computed.filter((p) => p.side !== 'SPARE').length} posiciones · {withTire} con cubierta ·{' '}
          {computed.filter((p) => p.side === 'SPARE').length} auxilio
        </p>
      </div>
    </TooltipProvider>
  );
}
