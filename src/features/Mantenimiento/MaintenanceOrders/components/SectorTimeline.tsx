'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export type SectorStatus = 'blocked' | 'pending' | 'in_progress' | 'paused' | 'completed';

export interface SectorTimelineItem {
  sectorId: string;
  sectorName: string;
  sequenceOrder: number;
  status: SectorStatus;
  totalTasks: number;
  completedTasks: number;
  diagnosticoCompleted: boolean;
}

interface SectorTimelineProps {
  sectors: SectorTimelineItem[];
  /** When provided, shows reorder arrows to swap sector positions */
  onReorder?: (sectorId: string, direction: 'up' | 'down') => void;
  isReordering?: boolean;
}

const statusColors: Record<SectorStatus, string> = {
  blocked: 'bg-muted border-muted-foreground/30 text-muted-foreground',
  pending: 'bg-info-subtle border-info text-info-subtle-foreground',
  in_progress: 'bg-warn-subtle border-warn text-warn-subtle-foreground',
  paused: 'bg-danger-subtle border-danger text-danger-subtle-foreground',
  completed: 'bg-ok-subtle border-ok text-ok-subtle-foreground',
};

const statusLineColors: Record<SectorStatus, string> = {
  blocked: 'bg-muted-foreground/30',
  pending: 'bg-info/50',
  in_progress: 'bg-warn/50',
  paused: 'bg-danger/50',
  completed: 'bg-ok',
};

const statusLabels: Record<SectorStatus, string> = {
  blocked: 'Bloqueado',
  pending: 'Pendiente',
  in_progress: 'En progreso',
  paused: 'Pausado',
  completed: 'Completado',
};

export function SectorTimeline({ sectors, onReorder, isReordering }: SectorTimelineProps) {
  const sorted = [...sectors].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Sin sectores asignados</p>;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center gap-0 overflow-x-auto py-2">
        {sorted.map((sector, index) => (
          <div key={sector.sectorId} className="flex items-center">
            {/* Sector circle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center min-w-[80px]">
                  {onReorder && (
                    <div className="flex gap-0.5 mb-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={index === 0 || isReordering}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReorder(sector.sectorId, 'up');
                        }}
                      >
                        <ArrowLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={index === sorted.length - 1 || isReordering}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReorder(sector.sectorId, 'down');
                        }}
                      >
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold',
                      statusColors[sector.status]
                    )}
                  >
                    {index + 1}
                  </div>
                  <span className="text-xs mt-1 text-center truncate max-w-[80px]">{sector.sectorName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {sector.completedTasks}/{sector.totalTasks}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <p className="font-medium">{sector.sectorName}</p>
                  <p>Estado: {statusLabels[sector.status]}</p>
                  <p>
                    Tareas: {sector.completedTasks}/{sector.totalTasks}
                  </p>
                  <p>Diagnostico: {sector.diagnosticoCompleted ? 'Completado' : 'Pendiente'}</p>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Connecting line */}
            {index < sorted.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-8 mx-1',
                  statusLineColors[sorted[index + 1].status === 'blocked' ? 'blocked' : sector.status]
                )}
              />
            )}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
