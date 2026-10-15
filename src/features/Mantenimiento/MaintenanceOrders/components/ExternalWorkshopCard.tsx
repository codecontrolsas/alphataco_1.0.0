'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Building2, CheckCircle2, ChevronDown, Loader2, Wrench } from 'lucide-react';
import React, { useState } from 'react';
import type { MaintenanceOrderData } from '../actions/queries.server';
import { getRepairDisplayName } from '../utils/repairDisplayName';

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>['variant']>;

const woStatusBadge: Record<string, BadgeVariant> = {
  pending: 'secondary',
  in_progress: 'warning',
  completed: 'success',
  completed_partial: 'yellow',
  paused: 'outline',
};

const woStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
  completed_partial: 'Completa parcial',
  paused: 'Pausada',
};

interface ExternalWorkshopCardProps {
  workshopName: string;
  items: MaintenanceOrderData['maintenance_order_items'];
  orderStatus: string;
  readOnly: boolean;
  onCompleteWorkOrder: (workOrderId: string) => void;
  isCompleting: boolean;
}

export function ExternalWorkshopCard({
  workshopName,
  items,
  orderStatus,
  readOnly,
  onCompleteWorkOrder,
  isCompleting,
}: ExternalWorkshopCardProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Collect all work orders from items
  const workOrders = items
    .map((item) => {
      const wo = item.work_orders;
      if (!wo || Array.isArray(wo)) return null;
      return {
        id: wo.id,
        orderNumber: wo.order_number,
        status: wo.status,
        repairName: getRepairDisplayName(item),
        itemId: item.id,
      };
    })
    .filter((wo): wo is NonNullable<typeof wo> => wo !== null);

  // Deduplicate by work order id
  const uniqueWOs = Array.from(new Map(workOrders.map((wo) => [wo.id, wo])).values());

  const allCompleted =
    uniqueWOs.length > 0 && uniqueWOs.every((wo) => wo.status === 'completed' || wo.status === 'completed_partial');
  const completedCount = uniqueWOs.filter(
    (wo) => wo.status === 'completed' || wo.status === 'completed_partial'
  ).length;

  return (
    <Card className="border-info/40">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsOpen((open) => !open);
              }
            }}
            className="hover:bg-muted/50 focus-visible:ring-ring cursor-pointer py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          >
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 aria-hidden="true" className="text-info h-4 w-4" />
                <Badge variant="outline" className="border-info/50 text-info-subtle-foreground text-xs">
                  Taller Externo
                </Badge>
                <span>{workshopName}</span>
                <Badge variant={allCompleted ? 'success' : 'secondary'}>
                  {allCompleted ? 'Completado' : 'Pendiente'}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground font-normal">
                  {completedCount}/{uniqueWOs.length} OTs
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            {uniqueWOs.map((wo) => {
              const isWOCompleted = wo.status === 'completed' || wo.status === 'completed_partial';
              const canComplete = orderStatus === 'in_workshop' && !readOnly && !isWOCompleted;

              return (
                <div key={wo.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/30">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  <code className="text-xs font-mono text-muted-foreground">{wo.orderNumber || 'Sin N°'}</code>
                  <span className="text-sm flex-1 text-muted-foreground">{wo.repairName}</span>
                  <Badge variant={wo.status ? woStatusBadge[wo.status] || 'outline' : 'outline'}>
                    {wo.status ? woStatusLabels[wo.status] || wo.status : 'Desconocido'}
                  </Badge>
                  {canComplete && (
                    <PermissionGuard module="mantenimiento" tab="ordenes_mantenimiento" action="update">
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="text-xs h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (wo.id) onCompleteWorkOrder(wo.id);
                        }}
                        disabled={isCompleting}
                      >
                        {isCompleting ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        )}
                        Completar
                      </Button>
                    </PermissionGuard>
                  )}
                  {isWOCompleted && <CheckCircle2 aria-hidden="true" className="text-ok h-4 w-4" />}
                </div>
              );
            })}

            {uniqueWOs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">Sin ordenes de trabajo generadas</p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
