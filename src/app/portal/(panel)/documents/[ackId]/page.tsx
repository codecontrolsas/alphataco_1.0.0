import { HseDocumentListSkeleton } from '@/features/Portal/components/HseDocumentList';
import { HseDocumentView } from '@/features/Portal/components/HseDocumentView';
import { Suspense } from 'react';

export const metadata = { title: 'Documento' };

export default async function PortalDocumentPage({ params }: { params: Promise<{ ackId: string }> }) {
  const { ackId } = await params;
  return (
    <Suspense fallback={<HseDocumentListSkeleton />}>
      <HseDocumentView ackId={ackId} />
    </Suspense>
  );
}
