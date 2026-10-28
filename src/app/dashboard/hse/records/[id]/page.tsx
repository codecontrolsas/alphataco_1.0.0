import { HseRecordDetailPage, getHseRecordTitle } from '@/features/Hse/RecordDetail/HseRecordDetailPage';
import { assertHseEnabled } from '@/features/Hse/lib/feature-gate';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await getHseRecordTitle((await params).id) };
}

export default async function HseRecordRoute({ params }: { params: Promise<{ id: string }> }) {
  await assertHseEnabled();
  const { id } = await params;
  return <HseRecordDetailPage id={id} />;
}
