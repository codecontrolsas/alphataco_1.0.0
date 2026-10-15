import { AccountStatementPage, getAccountStatementTitle } from '@/features/Treasury/Accounts/AccountStatementPage';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await getAccountStatementTitle((await params).id) };
}

export default async function AccountStatementRoute({ params }: { params: Promise<{ id: string }> }) {
  return <AccountStatementPage id={(await params).id} />;
}
