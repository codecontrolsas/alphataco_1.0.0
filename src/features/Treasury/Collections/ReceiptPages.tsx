import { Button } from '@/components/ui/button';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getReceiptDetail, getReceiptFormData } from '../actions/receipt-reads.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { emptyReceiptForm, type ReceiptFormValues } from '../schemas/receipts';
import { ReceiptDetailView } from './components/ReceiptDetailView';
import { ReceiptEditor } from './components/ReceiptEditor';

const BACK = '/dashboard/treasury?tab=cobranzas';

function Header({ title, back = BACK }: { title?: string; back?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href={back}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Cobranzas
        </Link>
      </Button>
      {title && <h1 className="text-xl font-semibold">{title}</h1>}
    </div>
  );
}

/**
 * `/dashboard/treasury/receipts/new[?customerId=&invoiceId=|checkId=]`: recibo nuevo (desde "A
 * cobrar" o el detalle de un cheque rechazado, con el comprobante o la deuda tildados).
 */
export async function NewReceiptPage({ customerId, invoiceId, checkId = null }: { customerId: string | null; invoiceId: string | null; checkId?: string | null }) {
  const permissions = await getUserPermissionsMapServer();
  if (permissions['tesoreria:cobranzas:create'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const data = await getReceiptFormData({ customerId: customerId ?? undefined });
  if (!data) return <StateBlock variant="error" title="No se pudo cargar la información" description="Actualizá la pantalla para intentarlo de nuevo." />;
  const values: ReceiptFormValues = emptyReceiptForm(data.today, data.customer?.id ?? '');
  const invoice = invoiceId ? data.openInvoices.find((i) => i.invoiceId === invoiceId) : undefined;
  if (invoice) {
    values.invoices = [{ invoiceId: invoice.invoiceId, amount: invoice.pending }];
    if (invoice.currency !== 'ARS') values.rates = [{ currency: invoice.currency as 'USD' | 'EUR', rate: '' }];
  }
  const debt = checkId ? data.checkDebts.find((d) => d.checkId === checkId) : undefined;
  if (debt) values.rejectedChecks = [{ checkId: debt.checkId, amount: debt.pending }];
  return (
    <div className="space-y-4">
      <Header title="Nuevo recibo" />
      <ReceiptEditor mode={{ kind: 'create' }} initialValues={values} initialData={data} canDelete={false} />
    </div>
  );
}

/** Un recibo por request, aunque lo pidan `generateMetadata` y la página. */
export const loadReceiptDetail = cache((id: string) => getReceiptDetail(id));

export async function receiptPageTitle(id: string): Promise<string> {
  const detail = await loadReceiptDetail(id);
  if (!detail) return 'Recibo | Tesorería';
  return `${detail.number ?? 'Borrador de recibo'} · ${detail.customer.name} | Tesorería`;
}

/** `/dashboard/treasury/receipts/[id]`: un borrador se edita; un confirmado o anulado se ve. */
export async function ReceiptPage({ id }: { id: string }) {
  const [detail, permissions] = await Promise.all([loadReceiptDetail(id), getUserPermissionsMapServer()]);
  if (permissions['tesoreria:cobranzas:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  if (!detail) notFound();
  const can = {
    update: permissions['tesoreria:cobranzas:update'] === true,
    delete: permissions['tesoreria:cobranzas:delete'] === true,
    attach: permissions['tesoreria:cobranzas:update'] === true || permissions['tesoreria:retenciones-sufridas:update'] === true,
  };

  if (detail.status === 'DRAFT' && can.update) {
    const data = await getReceiptFormData({ receiptId: id });
    if (!data?.receipt) notFound();
    return (
      <div className="space-y-4">
        <Header title={`Borrador de recibo · ${detail.customer.name}`} back={`${BACK}&view=receipts`} />
        <ReceiptEditor mode={{ kind: 'edit', receiptId: id }} initialValues={data.receipt.values} initialData={data} canDelete={can.delete} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header back={`${BACK}&view=receipts`} />
      <ReceiptDetailView
        detail={detail}
        can={can}
      />
    </div>
  );
}
