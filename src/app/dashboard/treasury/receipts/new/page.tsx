import { NewReceiptPage } from '@/features/Treasury/Collections/ReceiptPages';

export const metadata = { title: 'Nuevo recibo | Tesorería' };

const one = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

export default async function NewReceiptRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <NewReceiptPage customerId={one(params.customerId)} invoiceId={one(params.invoiceId)} />;
}
