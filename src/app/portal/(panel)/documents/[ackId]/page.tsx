import { HseDocumentView } from '@/features/Portal/components/documents/HseDocumentView';
import { PortalDetailSkeleton } from '@/features/Portal/fallback/PortalDetailSkeleton';
import { Suspense } from 'react';

export const metadata = { title: 'Documento' };

export default async function PortalDocumentPage({ params }: { params: Promise<{ ackId: string }> }) {
  const { ackId } = await params;
  return (
    <Suspense fallback={<PortalDetailSkeleton label="Cargando el documento" />}>
      <HseDocumentView ackId={ackId} />
    </Suspense>
  );
}
