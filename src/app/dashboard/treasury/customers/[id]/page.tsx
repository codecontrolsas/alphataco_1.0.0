import { CustomerStatementPage, customerStatementTitle } from '@/features/Treasury/Customers/CustomerStatementPage';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await customerStatementTitle((await params).id) };
}

export default async function CustomerStatementRoute({ params }: { params: Promise<{ id: string }> }) {
  return <CustomerStatementPage id={(await params).id} />;
}
