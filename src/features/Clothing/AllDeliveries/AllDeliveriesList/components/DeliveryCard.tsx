'use client';

import { Badge } from '@/components/ui/badge';
import { DeliveryStatusBadge } from '@/features/Clothing/components/DeliveryStatusBadge';
import { DeliveryReceiptButton } from '@/features/Clothing/pdf/DeliveryReceiptButton';
import { clothingDeliveryTypeBadges, clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import { Calendar, Check, Package, User, X } from 'lucide-react';
import moment from 'moment';
import type { AllDeliveryListItem } from '../actions.server';

interface DeliveryCardProps {
  delivery: AllDeliveryListItem;
}

export function DeliveryCard({ delivery }: DeliveryCardProps) {
  const recipient = delivery.employees_clothing_deliveries_employee_idToemployees;
  const deliverer = delivery.employees_clothing_deliveries_delivered_by_idToemployees;
  const items = delivery.clothing_delivery_items ?? [];
  const type = delivery.delivery_type;

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-3">
      {/* Row 1: Recipient + Date */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-semibold text-sm truncate">
              {recipient ? `${recipient.lastname ?? ''} ${recipient.firstname ?? ''}` : 'Sin destinatario'}
            </h3>
          </div>
          {recipient?.file && (
            <p className="text-xs text-muted-foreground mt-0.5 ml-6 font-mono">Legajo #{recipient.file}</p>
          )}
        </div>
        <DeliveryReceiptButton deliveryId={delivery.id} compact />
      </div>

      {/* Row 2: Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {type && (
          <Badge variant={clothingDeliveryTypeBadges[type]} className="text-[11px] px-2 py-0.5">
            {clothingDeliveryTypeLabels[type]}
          </Badge>
        )}
        {/* Almacenes etapa 5: una entrega anulada se distingue tambien en la vista movil. */}
        {delivery.cancelled_at && (
          <DeliveryStatusBadge cancelledAt={delivery.cancelled_at} cancelReason={delivery.cancel_reason} />
        )}
        <Badge variant={delivery.signature_url ? 'success' : 'secondary'} className="text-[11px] px-2 py-0.5 gap-1">
          {delivery.signature_url ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {delivery.signature_url ? 'Firmado' : 'Sin firma'}
        </Badge>
      </div>

      {/* Row 3: Items */}
      {items.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Package className="h-3 w-3" />
            <span>
              {items.length} artículo{items.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {items.slice(0, 3).map((item) => {
              const name = item.clothing_items?.name ?? 'Artículo';
              const brand = item.clothing_brands?.name;
              const size = item.clothing_sizes?.name;
              const detail = [brand, size].filter(Boolean).join(', ');
              return (
                <Badge key={item.id} variant="outline" className="text-[11px] font-normal">
                  {name}
                  {detail ? ` (${detail})` : ''} x{item.quantity}
                </Badge>
              );
            })}
            {items.length > 3 && (
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                +{items.length - 3} más
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Row 4: Footer — Date + Deliverer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3" />
          <span>{delivery.delivered_at ? moment(delivery.delivered_at).format('DD/MM/YYYY') : '-'}</span>
        </div>
        {deliverer && (
          <span className="truncate max-w-[50%] text-right">
            Entregó: {deliverer.lastname ?? ''} {deliverer.firstname ?? ''}
          </span>
        )}
      </div>
    </div>
  );
}
