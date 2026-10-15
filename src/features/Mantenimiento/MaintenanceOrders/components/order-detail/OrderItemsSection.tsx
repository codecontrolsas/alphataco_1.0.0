'use client';

import { Badge } from '@/components/ui/badge';
import { CommentAuthorLine, commentStyleConfig } from '@/features/Mantenimiento/components/ItemComments';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import { ClipboardList, MessageSquare, Wrench } from 'lucide-react';
import { statusBadgeVariants as taskStatusVariants, statusLabels as taskStatusLabels } from '../SectorCard';
import { itemStatusLabels, itemStatusVariants } from './types';
import type { useOrderDetailData } from './useOrderDetailData';

type DetailData = ReturnType<typeof useOrderDetailData>;

interface OrderItemsSectionProps {
  detailItems: DetailData['detailItems'];
  itemsWithComments: DetailData['itemsWithComments'];
}

/**
 * Ítems del pedido (cada uno con su estado, sus tareas y SUS fotos) y comentarios de la solicitud.
 * Las fotos van pegadas al ítem que las originó: así lo pidió el cliente.
 */
export function OrderItemsSection({ detailItems, itemsWithComments }: OrderItemsSectionProps) {
  return (
    <>
      {detailItems.length > 0 && (
        <section aria-labelledby="order-items-title" className="space-y-2">
          <h3
            id="order-items-title"
            className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase"
          >
            <ClipboardList aria-hidden="true" className="h-4 w-4" />
            Ítems del pedido
            <span className="font-normal tabular-nums">({detailItems.length})</span>
          </h3>

          <ul className="space-y-2">
            {detailItems.map((entry) => (
              <li key={entry.id} className="space-y-2 rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-sm leading-snug font-medium break-words">{entry.label}</span>
                  <Badge variant={itemStatusVariants[entry.statusKey]} className="shrink-0 text-[11px]">
                    {itemStatusLabels[entry.statusKey]}
                  </Badge>
                </div>

                {(entry.groupName || entry.sectorName || entry.workshopName || entry.isDiagnostico) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RepairGroupBadge groupName={entry.groupName} />
                    {entry.sectorName && (
                      <Badge variant="secondary" className="text-[11px]">
                        {entry.sectorName}
                      </Badge>
                    )}
                    {!entry.sectorName && entry.workshopName && (
                      <Badge variant="outline" className="border-info/50 text-info-subtle-foreground text-[11px]">
                        {entry.workshopName}
                      </Badge>
                    )}
                    {entry.isDiagnostico && (
                      <Badge variant="secondary" className="text-[11px]">
                        Diagnóstico
                      </Badge>
                    )}
                  </div>
                )}

                {entry.description && (
                  <p className="text-muted-foreground text-xs break-words whitespace-pre-wrap">{entry.description}</p>
                )}

                {/* Estado tarea por tarea: si más adelante se rechaza una sola, se ve cuál sin salir del detalle. */}
                {entry.tasks.length > 0 && (
                  <ul className="space-y-1">
                    {entry.tasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-2 text-xs">
                        <Wrench aria-hidden="true" className="text-muted-foreground h-3 w-3 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{task.repairTypeName}</span>
                        <Badge variant={taskStatusVariants[task.status] ?? 'secondary'} className="shrink-0 text-[11px]">
                          {taskStatusLabels[task.status] ?? task.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}

                {entry.rejectionReason && (
                  <div className="border-danger/30 bg-danger-subtle text-danger-subtle-foreground rounded border px-2 py-1.5 text-xs">
                    <span className="font-medium">Motivo del rechazo: </span>
                    <span className="italic">{entry.rejectionReason}</span>
                  </div>
                )}

                <RepairItemPhotos images={entry.images} label={entry.label} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {itemsWithComments.length > 0 && (
        <section aria-labelledby="order-comments-title" className="space-y-3">
          <h3
            id="order-comments-title"
            className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase"
          >
            <MessageSquare aria-hidden="true" className="h-4 w-4" />
            Comentarios de la Solicitud
          </h3>
          {itemsWithComments.map((group, idx) => (
            <div key={idx} className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {group.itemLabel}
              </span>
              {group.comments.map((comment, cidx) => {
                const cfg = commentStyleConfig[comment.style];
                return (
                  <div key={cidx} className={`rounded-md border p-2.5 text-sm ${cfg.container} ${cfg.border}`}>
                    <CommentAuthorLine comment={comment} />
                    <p className={`mt-0.5 text-sm ${comment.style !== 'description' ? 'italic' : ''}`}>
                      {comment.text}
                    </p>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
