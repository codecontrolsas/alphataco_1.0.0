'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DELIVERY_STATUS_ACTIVE,
  DELIVERY_STATUS_CANCELLED,
  deliveryStatusLabels,
} from '@/features/Clothing/lib/delivery-stock-where';
import type { FacetResult } from '@/shared/components/common/DataTable';
import { Ban, CheckCircle2, type LucideIcon } from 'lucide-react';
import moment from 'moment';

/** Iconos del estado: los mismos en el badge de la celda y en las opciones del filtro. */
export const deliveryStatusIcons: Record<string, LucideIcon> = {
  [DELIVERY_STATUS_ACTIVE]: CheckCircle2,
  [DELIVERY_STATUS_CANCELLED]: Ban,
};

/** Opciones del filtro "Estado" con los mismos labels/iconos que muestra la celda. */
export function buildDeliveryStatusFacetResult(counts: Map<string, number>): FacetResult {
  return {
    options: [DELIVERY_STATUS_ACTIVE, DELIVERY_STATUS_CANCELLED].map((value) => ({
      value,
      label: deliveryStatusLabels[value],
      icon: deliveryStatusIcons[value],
    })),
    counts,
  };
}

/** Badge "Vigente" / "Anulada"; la anulada muestra fecha y motivo en un tooltip y el motivo debajo. */
export function DeliveryStatusBadge({
  cancelledAt,
  cancelReason,
}: {
  cancelledAt: Date | string | null;
  cancelReason: string | null;
}) {
  if (!cancelledAt) {
    const Icon = deliveryStatusIcons[DELIVERY_STATUS_ACTIVE];
    return (
      <Badge variant="success" className="gap-1">
        <Icon className="h-3 w-3" />
        {deliveryStatusLabels[DELIVERY_STATUS_ACTIVE]}
      </Badge>
    );
  }
  const Icon = deliveryStatusIcons[DELIVERY_STATUS_CANCELLED];
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex max-w-[16rem] cursor-default flex-col items-start gap-0.5">
            <Badge variant="destructive" className="gap-1">
              <Icon className="h-3 w-3" />
              {deliveryStatusLabels[DELIVERY_STATUS_CANCELLED]}
            </Badge>
            {cancelReason && <span className="line-clamp-2 text-xs text-muted-foreground">{cancelReason}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs rounded-lg bg-black p-2 text-white">
          <div className="flex flex-col gap-1 text-sm">
            <span>Anulada el {moment(cancelledAt).format('DD/MM/YYYY HH:mm')}</span>
            {cancelReason && <span>Motivo: {cancelReason}</span>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
