import { OwnCheckPage, ownCheckPageTitle } from '@/features/Treasury/OwnChecks/OwnCheckPages';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await ownCheckPageTitle((await params).id) };
}

export default async function OwnCheckRoute({ params }: { params: Promise<{ id: string }> }) {
  return <OwnCheckPage id={(await params).id} />;
}
