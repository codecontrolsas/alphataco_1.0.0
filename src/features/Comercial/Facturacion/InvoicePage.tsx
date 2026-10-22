import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { getInvoiceReceivable } from '@/features/Treasury/actions/customer-statement.server';
import { Lock } from 'lucide-react';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getInvoiceForEditor } from './actions/invoices.server';
import { InvoiceDetail } from './components/detail/InvoiceDetail';
import type { InvoicePermissions } from './components/editor/InvoiceDraftForm';
import { InvoiceEditor } from './components/editor/InvoiceEditor';
import { isEditable } from './lib/invoice-state-machine';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un comprobante por request, aunque lo pidan `generateMetadata` y la página (`React.cache`).
 * Un id que no es UUID no llega a la base.
 */
export const loadInvoicePageData = cache(async (id: string) => (UUID_RE.test(id) ? getInvoiceForEditor(id) : null));

/** `document.title`: "Factura A 00003-00000124 · Facturación" o "Factura A · Borrador · Facturación". */
export async function invoicePageTitle(id: string): Promise<string> {
  const data = await loadInvoicePageData(id);
  if (!data) return 'Comprobante no encontrado · Facturación';
  const { invoice } = data;
  if (invoice.number === null) {
    return `${invoice.cbteLabel} · ${invoice.status === 'rechazada' ? 'Rechazada' : 'Borrador'} · Facturación`;
  }
  return `${invoice.cbteLabel} ${invoice.voucherNumber} · Facturación`;
}

/**
 * `/dashboard/comercial/facturacion/[id]`: un solo lugar por comprobante. Borrador o rechazado →
 * editor; enviado a ARCA (emitiendo, pendiente, autorizado) → detalle. Datos y permisos en paralelo.
 */
export async function InvoicePage({ id, result }: { id: string; result: string | null }) {
  const [data, permissionsMap] = await Promise.all([loadInvoicePageData(id), getUserPermissionsMapServer()]);
  if (!data) notFound();

  const can = (action: string) => permissionsMap[`comercial:facturacion:${action}`] === true;
  if (!can('view')) {
    return (
      <div className="flex items-start gap-3 py-8 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>No tenés permiso para ver comprobantes de Facturación.</p>
      </div>
    );
  }

  const permissions: InvoicePermissions = {
    canCreate: can('create'),
    canUpdate: can('update'),
    canDelete: can('delete'),
    canApprove: can('approve'),
    canViewPrices: can('view_prices'),
  };

  if (isEditable(data.invoice.status)) {
    return <InvoiceEditor data={data} permissions={permissions} result={result} />;
  }
  // Pendiente de cobro: solo con permiso de Cobranzas en Tesorería (spec Tesorería etapa 2 §4.6).
  const receivable =
    permissionsMap['tesoreria:cobranzas:view'] === true && data.invoice.status === 'autorizada'
      ? await getInvoiceReceivable(id)
      : null;
  return (
    <InvoiceDetail
      data={data}
      permissions={permissions}
      result={result}
      originAccess={{
        orders: permissionsMap['operaciones:preparte:view'] === true,
        reports: permissionsMap['operaciones:detalle-parte-diario:view'] === true,
        certifications: permissionsMap['comercial:certificaciones:view'] === true,
      }}
      receivable={
        receivable ? { ...receivable, canCollect: permissionsMap['tesoreria:cobranzas:create'] === true } : null
      }
    />
  );
}
