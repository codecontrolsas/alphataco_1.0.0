import {
  getPaymentOrderDetail,
  getPaymentOrderEditValues,
  getPaymentOrderFormData,
} from '@/features/Purchases/actions/payment-queries.server';
import { EditPaymentOrderPage } from '@/features/Purchases/Payments/PaymentPages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Editar orden de pago | Compras' };

export default async function EditPaymentOrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [values, detail] = await Promise.all([getPaymentOrderEditValues(id), getPaymentOrderDetail(id)]);
  if (!values || !detail || !detail.can.edit) notFound();
  const data = await getPaymentOrderFormData(values.supplierId, { excludeOrderId: id });
  if (!data) notFound();
  return <EditPaymentOrderPage orderId={id} number={detail.number} values={values} data={data} />;
}
