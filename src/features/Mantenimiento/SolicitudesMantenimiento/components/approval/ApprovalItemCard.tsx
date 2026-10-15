'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, MessageSquarePlus, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { RepairItemPhotos } from '../../../shared/components/RepairItemPhotos';
import type { DeviationItem, ItemsApprovalValues } from './approval-schema';

interface ApprovalItemCardProps {
  item: DeviationItem;
  /** Posición del ítem en `items` del formulario. */
  index: number;
  disabled: boolean;
}

/**
 * Ítem a decidir: segmentado Aprobar / Rechazar (`aria-pressed`), comentario del validador y motivo
 * inline obligatorio al rechazar. La severidad se dice con texto ("Crítico"), no solo con color.
 */
export function ApprovalItemCard({ item, index, disabled }: ApprovalItemCardProps) {
  const { control, setValue } = useFormContext<ItemsApprovalValues>();
  const decision = useWatch({ control, name: `items.${index}` });
  const [showComment, setShowComment] = useState(() => !!decision?.validatorComment);

  if (!decision) return null;

  const isApproved = decision.status === 'approved';
  const isRejected = decision.status === 'rejected';
  const hasDriverComment = !!item.driver_comment;

  // Volver a pulsar la opción activa la deshace ("Cambiar" del diseño anterior).
  const setStatus = (next: 'approved' | 'rejected') => {
    const target = decision.status === next ? 'pending' : next;
    setValue(`items.${index}.status`, target, { shouldValidate: true, shouldDirty: true });
    if (target !== 'rejected') setValue(`items.${index}.rejectionReason`, '', { shouldValidate: true });
  };

  const closeComment = () => {
    setValue(`items.${index}.validatorComment`, '', { shouldDirty: true });
    setShowComment(false);
  };

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border p-4',
        isRejected && 'border-destructive/50 bg-destructive/5',
        isApproved && 'border-ok/50 bg-ok-subtle/40'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.item_label}</span>
            <RepairGroupBadge groupName={item.group_name} />
            {item.is_critical && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle aria-hidden="true" />
                Crítico
              </Badge>
            )}
          </div>
          {item.section_code && (
            <p className="text-muted-foreground mt-1 text-sm capitalize">
              Sección: {item.section_code.replace('_', ' ')}
            </p>
          )}
          {item.description && <p className="text-muted-foreground mt-1 text-sm italic">{item.description}</p>}
          {/* Fotos que adjunto el supervisor: son el contexto para decidir la aprobacion */}
          <RepairItemPhotos images={item.images} label={item.item_label} size="sm" className="mt-2" />
          {hasDriverComment && (
            <div className="bg-muted/50 mt-2 rounded p-2 text-sm">
              <span className="text-muted-foreground">Comentario del chofer: </span>
              <span className="italic">{item.driver_comment}</span>
            </div>
          )}
        </div>

        <div role="group" aria-label={`Decisión para ${item.item_label}`} className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant={isApproved ? 'default' : 'outline'}
            aria-pressed={isApproved}
            disabled={disabled}
            onClick={() => setStatus('approved')}
          >
            <Check className="mr-1 h-4 w-4" aria-hidden="true" />
            Aprobar
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isRejected ? 'destructive' : 'outline'}
            aria-pressed={isRejected}
            disabled={disabled}
            onClick={() => setStatus('rejected')}
          >
            <X className="mr-1 h-4 w-4" aria-hidden="true" />
            Rechazar
          </Button>
        </div>
      </div>

      {/* Comentario del validador (opcional) */}
      {!showComment ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowComment(true)} className="gap-2" disabled={disabled}>
          {hasDriverComment ? (
            <>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Ampliar comentario
            </>
          ) : (
            <>
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
              Agregar comentario
            </>
          )}
        </Button>
      ) : (
        <FormField
          control={control}
          name={`items.${index}.validatorComment`}
          render={({ field }) => (
            <FormItem className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel className="text-sm">Comentario del validador (opcional)</FormLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeComment}
                  className="h-6 w-6 p-0"
                  aria-label="Quitar comentario del validador"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <FormControl>
                <Textarea {...field} placeholder="Agregue observaciones adicionales..." rows={2} autoFocus />
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {/* Motivo de rechazo (solo si está rechazado) */}
      {isRejected && (
        <FormField
          control={control}
          name={`items.${index}.rejectionReason`}
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel>Motivo del rechazo *</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Indique el motivo del rechazo..." rows={2} disabled={disabled} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Estado en texto: nunca solo color */}
      <div className="flex justify-end">
        <Badge variant={isApproved ? 'success' : isRejected ? 'destructive' : 'secondary'}>
          {isApproved ? 'Aprobado' : isRejected ? 'Rechazado' : 'Pendiente de decisión'}
        </Badge>
      </div>
    </div>
  );
}
