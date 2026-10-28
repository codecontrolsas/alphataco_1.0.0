import { HseTrainingDetailPage, getHseTrainingTitle } from '@/features/Hse/TrainingDetail/HseTrainingDetailPage';
import { requireModulePage } from '@/features/Modules/server/modules.server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await getHseTrainingTitle((await params).id) };
}

export default async function HseTrainingRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulePage('hse');
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return <HseTrainingDetailPage id={id} searchParams={resolvedSearchParams} />;
}
