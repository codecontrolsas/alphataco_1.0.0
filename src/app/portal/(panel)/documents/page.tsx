import { DocumentsEmptyState } from '@/features/Portal/components/DocumentsEmptyState';
import { PortalPageHeader } from '@/features/Portal/components/PortalPageHeader';

export const metadata = { title: 'Mis documentos' };

export default function PortalDocumentsPage() {
  return (
    <>
      <PortalPageHeader
        title="Mis documentos"
        description="Normas y procedimientos que la empresa te pide leer y aceptar."
      />
      <DocumentsEmptyState />
    </>
  );
}
