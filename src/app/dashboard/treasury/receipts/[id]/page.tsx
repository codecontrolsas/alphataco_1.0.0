import { ReceiptPage, receiptPageTitle } from '@/features/Treasury/Collections/ReceiptPages';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await receiptPageTitle((await params).id) };
}

export default async function ReceiptRoute({ params }: { params: Promise<{ id: string }> }) {
  return <ReceiptPage id={(await params).id} />;
}
