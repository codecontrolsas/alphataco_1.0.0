import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { DocumentCompanyInfo } from '@/features/Documentacion/DetalleDocumento/actions/document-detail.server';
import { dateOnlyLabel, formatCuit } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { DetailFacts, type DetailFact } from './DetailFacts';

interface CompanyInfoCardProps {
  company: DocumentCompanyInfo | null;
  /** Texto que explica de qué empresa se trata (la dueña del documento o la que lo solicita). */
  description: string;
  /** Fecha de alta del recurso; sólo la muestran los documentos de empleado. */
  dateOfAdmission?: Date | string | null;
  /** Los documentos de empleado/equipo muestran además la descripción de la empresa. */
  showDescription?: boolean;
}

/** Sección "Empresa" de la ficha del documento. */
export function CompanyInfoCard({
  company,
  description,
  dateOfAdmission,
  showDescription = false,
}: CompanyInfoCardProps) {
  const admissionDate = dateOnlyLabel(dateOfAdmission);
  const facts: DetailFact[] = [{ label: 'CUIT', value: formatCuit(company?.company_cuit) }];
  if (company?.address) facts.push({ label: 'Dirección', value: company.address });
  if (company?.country) facts.push({ label: 'País', value: company.country });
  if (company?.province_id?.name) facts.push({ label: 'Provincia', value: company.province_id.name });
  if (company?.contact_phone) facts.push({ label: 'Teléfono de contacto', value: company.contact_phone });
  if (company?.contact_email) facts.push({ label: 'Email de contacto', value: company.contact_email });
  if (admissionDate) facts.push({ label: 'Fecha de alta', value: admissionDate });
  if (showDescription && company?.description)
    facts.push({ label: 'Descripción', value: company.description, wide: true });

  return (
    <DetailFacts
      title="Empresa"
      description={description}
      facts={facts}
      lead={
        <div className="mb-5 flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage
              src={company?.company_logo ?? undefined}
              alt="Logo de la empresa"
              className="rounded-full object-contain"
            />
            <AvatarFallback>Logo</AvatarFallback>
          </Avatar>
          <p className="text-lg font-semibold">{company?.company_name}</p>
        </div>
      }
    />
  );
}
