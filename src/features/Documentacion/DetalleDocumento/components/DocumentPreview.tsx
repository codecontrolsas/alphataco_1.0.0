import { isPdfUrl } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { cn } from '@/lib/utils';
import { SectionCard } from '@/shared/components/common/SectionCard';

/** Visor del archivo del documento: los PDF se embeben a alto de pantalla. */
export function DocumentPreview({ fileUrl }: { fileUrl: string }) {
  return (
    <SectionCard title="Archivo" flush>
      <div className="flex justify-center p-3">
        <embed
          title="Vista previa del documento"
          src={`${fileUrl}#&navpanes=0&scrollbar=0&zoom=110`}
          className={cn('max-h-[80dvh] max-w-full rounded-lg', isPdfUrl(fileUrl) && 'h-[75dvh] w-full')}
        />
      </div>
    </SectionCard>
  );
}
