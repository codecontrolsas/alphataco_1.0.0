'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatQuantity, formatUnitCost } from '@/features/Warehouses/lib/format';
import { VAT_RATE_LABELS } from '@/shared/lib/arca/catalogs';
import { useState } from 'react';
import type { SupplierInvoiceFormData } from '../../lib/invoice-query-types';
import { pickableOrderLines } from '../../lib/invoice-form';
import { type OrderLineOption } from './supplier-invoice-form-model';

export function OrderLinesPicker({
  open,
  onOpenChange,
  orders,
  kind,
  alreadyAdded,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: SupplierInvoiceFormData['orders'];
  kind: 'invoice' | 'debit_note' | 'credit_note';
  alreadyAdded: Set<string>;
  onAdd: (lines: (OrderLineOption & { quantity: string })[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isCredit = kind === 'credit_note';
  const options = pickableOrderLines(orders, kind, alreadyAdded);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const close = (value: boolean) => {
    if (!value) setSelected(new Set());
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agregar desde OC</DialogTitle>
          <DialogDescription>
            {isCredit
              ? 'Líneas ya facturadas que la nota de crédito puede acreditar, con el precio y la alícuota de la OC.'
              : 'Líneas recibidas y todavía no facturadas, con el precio y la alícuota de la OC.'}
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <Alert>
            <AlertDescription>
              {isCredit ? 'Este proveedor no tiene líneas facturadas para acreditar.' : 'Este proveedor no tiene líneas recibidas pendientes de facturar.'}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {options.map((order) => (
              <div key={order.id} className="space-y-2">
                <p className="font-mono text-sm font-medium">{order.number}</p>
                {order.lines.map((line) => {
                  const id = `pick-${line.orderLineId}`;
                  return (
                    <div key={line.orderLineId} className="flex items-start gap-3 rounded-md border p-2">
                      <Checkbox id={id} checked={selected.has(line.orderLineId)} onCheckedChange={() => toggle(line.orderLineId)} />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                        <span className="block">{line.label}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {isCredit ? 'Facturado' : 'Por facturar'} {formatQuantity(line.quantity)} {line.unitAbbr} · {formatUnitCost(line.unitPrice)} +{' '}
                          {VAT_RATE_LABELS[line.vatRateId as keyof typeof VAT_RATE_LABELS]}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={selected.size === 0}
            onClick={() => {
              onAdd(options.flatMap((order) => order.lines.filter((line) => selected.has(line.orderLineId))));
              setSelected(new Set());
            }}
          >
            Agregar {selected.size > 0 ? selected.size : ''} {selected.size === 1 ? 'línea' : 'líneas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
