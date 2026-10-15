'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus } from 'lucide-react';
import { useDailyReportDetailFormStore } from '../../store/dailyReportDetailFormStore';
import { canCreateRows } from '../lib/row-permissions';

interface Props {
  canUpdate: boolean;
  dailyReportStatus: string;
  reportDate: string;
}

/** Abre el panel de línea en modo alta (store global). Sin permiso de edición no se muestra. */
export function NewLineButton({ canUpdate, dailyReportStatus, reportDate }: Props) {
  const openForm = useDailyReportDetailFormStore((state) => state.open);

  if (!canUpdate) return null;

  if (canCreateRows({ canUpdate, dailyReportStatus, reportDate })) {
    return (
      <Button type="button" onClick={() => openForm()}>
        <Plus aria-hidden="true" />
        Nueva línea
      </Button>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Button type="button" disabled>
              <Plus aria-hidden="true" />
              Nueva línea
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="max-w-xs text-xs">El parte está cerrado y no es el día de hoy</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
