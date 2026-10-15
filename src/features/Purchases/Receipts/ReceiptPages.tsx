import { Card, CardContent } from '@/components/ui/card';
import { PurchasesPageShell } from '../components/PurchasesPageShell';
import type { PurchaseReceiptDetail, ReceiptFormData } from '../actions/receipts.server';
import { PurchaseReceiptDetailView } from './components/PurchaseReceiptDetailView';
import { PurchaseReceiptForm } from './components/PurchaseReceiptForm';

export function NewPurchaseReceiptPage({ data }: { data: ReceiptFormData }) {
  const back = { href: `/dashboard/purchases/orders/${data.order.id}`, label: data.order.number };
  if (!data.order.canReceive) {
    return (
      <PurchasesPageShell title="Registrar recepción" back={back}>
        <Card>
          <CardContent className="pt-6 text-sm">
            La orden {data.order.number} no está enviada al proveedor ni recibida en parte: no se puede recibir.
          </CardContent>
        </Card>
      </PurchasesPageShell>
    );
  }
  return (
    <PurchasesPageShell title={`Registrar recepción de ${data.order.number}`} back={back}>
      <PurchaseReceiptForm data={data} />
    </PurchasesPageShell>
  );
}

export function PurchaseReceiptPage({ receipt }: { receipt: PurchaseReceiptDetail }) {
  return (
    <PurchasesPageShell back={{ href: '/dashboard/purchases?tab=recepciones', label: 'Recepciones' }}>
      <PurchaseReceiptDetailView receipt={receipt} />
    </PurchasesPageShell>
  );
}
