'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createClothingDelivery,
  type CreateDeliveryInput,
} from '@/features/Clothing/ClothingDelivery/actions/deliveries.server';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import type { EmployeeForDelivery } from '@/features/Clothing/ClothingDelivery/actions/queries.server';
import type { WizardItem } from '@/features/Clothing/ClothingDelivery/components/StepAddItems';
import { clothingDeliveryTypeBadges, clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import type { clothing_delivery_type } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, CalendarDays, CreditCard, Loader2, Package, Pen, ScrollText, User } from 'lucide-react';
import moment from 'moment';
import { useCallback } from 'react';
import { toast } from 'sonner';

const logger = new Logger('Clothing/StepConfirm');

interface StepConfirmProps {
  employee: EmployeeForDelivery;
  deliveryType: string;
  warehouseId: string;
  warehouseName: string | null;
  items: WizardItem[];
  signatureUrl: string | null;
  notes: string;
  onNotesChange: (notes: string) => void;
  onReset: () => void;
}

export function StepConfirm({
  employee,
  deliveryType,
  warehouseId,
  warehouseName,
  items,
  signatureUrl,
  notes,
  onNotesChange,
  onReset,
}: StepConfirmProps) {
  const queryClient = useQueryClient();
  // El disponible por talle cambia al entregar (y conviene releerlo si fallo por stock).
  const refreshAvailability = () => queryClient.invalidateQueries({ queryKey: ['clothing-sizes-for-item-brand'] });
  const { mutate, isPending } = useMutation({
    // El servidor devuelve el error (no lo lanza): asi llega el detalle de stock faltante.
    mutationFn: async (data: CreateDeliveryInput) => unwrapAction(await createClothingDelivery(data)),
    onSuccess: () => {
      logger.info('Delivery created successfully');
      toast.success('Entrega registrada correctamente');
      refreshAvailability();
      onReset();
    },
    onError: (err) => {
      logger.error('Error creating delivery', { data: { err } });
      // El asistente no se reinicia: el operario corrige (depósito, cantidad) y vuelve a confirmar.
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar la entrega. Intente nuevamente.');
      refreshAvailability();
    },
  });

  const handleConfirm = useCallback(() => {
    logger.debug('Confirming delivery', {
      data: {
        employeeId: employee.id,
        deliveryType,
        itemCount: items.length,
      },
    });

    mutate({
      employeeId: employee.id,
      warehouseId,
      deliveryType,
      signatureUrl: signatureUrl ?? undefined,
      notes: notes.trim() || undefined,
      deliveredAt: new Date().toISOString(),
      items: items.map((item) => ({
        clothingItemId: item.clothingItemId,
        clothingBrandId: item.clothingBrandId,
        clothingSizeId: item.clothingSizeId,
        quantity: item.quantity,
        hasCertificate: item.hasCertificate,
      })),
    });
  }, [employee.id, warehouseId, deliveryType, items, signatureUrl, notes, mutate]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium mb-1.5 text-foreground">Resumen de la entrega</p>
        <p className="text-sm text-muted-foreground mb-3">
          Revise los datos antes de confirmar. La entrega quedara registrada con fecha y hora actual.
        </p>
      </div>

      {/* Employee */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Empleado</p>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">
              {employee.lastname} {employee.firstname}
            </p>
            <p className="text-xs text-muted-foreground">Legajo #{employee.file}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {employee.company_positions?.name && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Briefcase className="h-3 w-3" />
              {employee.company_positions.name}
            </Badge>
          )}
          {employee.cuil && (
            <Badge variant="outline" className="gap-1 text-xs">
              <CreditCard className="h-3 w-3" />
              CUIL: {employee.cuil}
            </Badge>
          )}
          {employee.covenant?.name && (
            <Badge variant="outline" className="gap-1 text-xs">
              <ScrollText className="h-3 w-3" />
              CCT: {employee.covenant.name}
            </Badge>
          )}
          {employee.date_of_admission && (
            <Badge variant="outline" className="gap-1 text-xs">
              <CalendarDays className="h-3 w-3" />
              Ingreso: {moment(employee.date_of_admission).format('DD/MM/YYYY')}
            </Badge>
          )}
        </div>
      </div>

      {/* Delivery type */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo de entrega</p>
        <Badge variant={clothingDeliveryTypeBadges[deliveryType as clothing_delivery_type]}>
          {clothingDeliveryTypeLabels[deliveryType as clothing_delivery_type]}
        </Badge>
      </div>

      {/* Depósito (Almacenes etapa 5) */}
      <div className="rounded-lg border bg-card p-4 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sale del depósito</p>
        <p className="text-sm font-medium">{warehouseName ?? '—'}</p>
      </div>

      {/* Items */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Artículos ({items.length})
        </p>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 py-2 border-b last:border-b-0">
              <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Package className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.itemName}</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {item.brandName && <span className="text-xs text-muted-foreground">Marca: {item.brandName}</span>}
                  {item.sizeName && <span className="text-xs text-muted-foreground">· Talle: {item.sizeName}</span>}
                  <span className="text-xs text-muted-foreground">
                    · Certificado: {item.hasCertificate ? 'Sí' : 'No'}
                  </span>
                </div>
              </div>
              <Badge variant="outline" className="text-xs flex-shrink-0">
                x{item.quantity}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Signature preview */}
      {signatureUrl && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Pen className="h-3.5 w-3.5" />
            Firma
          </p>
          <div className="rounded border overflow-hidden bg-white dark:bg-neutral-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signatureUrl} alt="Firma del empleado" className="w-full h-28 object-contain p-1" />
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="delivery-notes" className="text-sm font-medium">
          Observaciones
        </Label>
        <Textarea
          id="delivery-notes"
          placeholder="Observaciones adicionales (opcional)..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>

      {/* Date/time info */}
      <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Fecha de entrega: {moment().format('DD/MM/YYYY HH:mm')}
      </div>

      {/* Action button */}
      <div className="pt-1">
        <Button type="button" onClick={handleConfirm} disabled={isPending} size="lg" className="w-full gap-2">
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Registrando...
            </>
          ) : (
            'Confirmar Entrega'
          )}
        </Button>
      </div>
    </div>
  );
}
