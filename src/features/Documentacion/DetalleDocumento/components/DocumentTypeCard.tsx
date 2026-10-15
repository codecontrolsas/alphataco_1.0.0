import type { DocumentTypeInfo } from '@/features/Documentacion/DetalleDocumento/actions/document-detail.server';
import { expiryLabel, uploadedAtLabel } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { DetailFacts, type DetailFact } from './DetailFacts';

interface DocumentTypeCardProps {
  documentType: DocumentTypeInfo | null;
  /** Los documentos de empresa no tienen recurso, por eso no muestran "multirecurso". */
  isCompanyDocument: boolean;
  validity: Date | string | null;
  createdAt: Date | string | null;
  period: string | null;
}

/** Sección "Documento" de la ficha: datos del tipo de documento y del archivo cargado. */
export function DocumentTypeCard({
  documentType,
  isCompanyDocument,
  validity,
  createdAt,
  period,
}: DocumentTypeCardProps) {
  const facts: DetailFact[] = [
    { label: 'Obligatoriedad', value: documentType?.mandatory ? 'Es mandatorio' : 'No es mandatorio' },
  ];
  if (!isCompanyDocument) {
    facts.push({
      label: 'Multirecurso',
      value: documentType?.multiresource ? 'Es multirecurso' : 'No es multirecurso',
    });
  }
  facts.push(
    { label: 'Vencimiento', value: expiryLabel(documentType?.explired, validity) },
    { label: 'Aplica a', value: documentType?.applies },
    { label: 'Carga', value: uploadedAtLabel(createdAt) }
  );
  if (period) facts.push({ label: 'Período', value: period });
  if (documentType?.special) {
    facts.push({
      label: 'Consideraciones especiales',
      value: documentType.description,
      wide: true,
    });
  }

  return (
    <DetailFacts
      title={documentType?.name ?? 'Documento'}
      description={
        isCompanyDocument ? 'Datos del documento de empresa' : 'Datos del documento que se le solicita al recurso'
      }
      facts={facts}
    />
  );
}
