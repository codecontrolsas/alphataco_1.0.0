import { HseDocumentList, HseDocumentListSkeleton } from '@/features/Portal/components/HseDocumentList';
import { PortalPageHeader } from '@/features/Portal/components/PortalPageHeader';
import { Suspense } from 'react';

export const metadata = { title: 'Mis documentos' };

export default function PortalDocumentsPage() {
  return (
    <>
      <PortalPageHeader
        title="Mis documentos"
        description="Normas y procedimientos que la empresa te pide leer y aceptar."
      />
      <Suspense fallback={<HseDocumentListSkeleton />}>
        <HseDocumentList />
      </Suspense>
    </>
  );
}
