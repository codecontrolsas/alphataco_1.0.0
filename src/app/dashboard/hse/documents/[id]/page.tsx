import { HseDocumentDetailPage, getHseDocumentTitle } from '@/features/Hse/DocumentDetail/HseDocumentDetailPage';
import { requireModulePage } from '@/features/Modules/server/modules.server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: await getHseDocumentTitle((await params).id) };
}

export default async function HseDocumentRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulePage('hse');
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return <HseDocumentDetailPage id={id} searchParams={resolvedSearchParams} />;
}
