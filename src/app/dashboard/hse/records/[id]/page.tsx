import { HseRecordDetailPage, getHseRecordTitle } from '@/features/Hse/RecordDetail/HseRecordDetailPage';
import { requireModulePage } from '@/features/Modules/server/modules.server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await getHseRecordTitle((await params).id) };
}

export default async function HseRecordRoute({ params }: { params: Promise<{ id: string }> }) {
  await requireModulePage('hse');
  const { id } = await params;
  return <HseRecordDetailPage id={id} />;
}
