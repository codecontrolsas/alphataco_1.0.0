import { CheckPage, checkPageTitle } from '@/features/Treasury/Checks/CheckPages';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await checkPageTitle((await params).id) };
}

export default async function CheckRoute({ params }: { params: Promise<{ id: string }> }) {
  return <CheckPage id={(await params).id} />;
}
