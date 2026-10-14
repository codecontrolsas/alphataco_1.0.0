import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import type { DocumentCompanyInfo } from '@/features/Documentacion/DetalleDocumento/actions/document-detail.server';
import { dateOnlyLabel, formatCuit } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';

interface CompanyInfoCardProps {
  company: DocumentCompanyInfo | null;
  /** Texto que explica de qué empresa se trata (la dueña del documento o la que lo solicita). */
  description: string;
  /** Fecha de alta del recurso; sólo la muestran los documentos de empleado. */
  dateOfAdmission?: Date | string | null;
  /** Los documentos de empleado/equipo muestran además la descripción de la empresa. */
  showDescription?: boolean;
}

/** Tab "Empresa" del detalle de documento. */
export function CompanyInfoCard({
  company,
  description,
  dateOfAdmission,
  showDescription = false,
}: CompanyInfoCardProps) {
  const admissionDate = dateOnlyLabel(dateOfAdmission);

  return (
    <Card>
      <div className="space-y-3 p-3">
        <CardDescription>{description}</CardDescription>
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell className="flex items-center gap-3">
                <Avatar className="size-24">
                  <AvatarImage
                    src={company?.company_logo ?? undefined}
                    alt="Logo de la empresa"
                    className="rounded-full object-contain"
                  />
                  <AvatarFallback>Logo</AvatarFallback>
                </Avatar>
                <CardTitle className="font-bold text-lg">{company?.company_name}</CardTitle>
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <CardDescription>
                  <span className="font-bold">CUIT:</span> {formatCuit(company?.company_cuit)}
                </CardDescription>
              </TableCell>
            </TableRow>
            {company?.address && (
              <TableRow>
                <TableCell>
                  <CardDescription className="capitalize">
                    <span className="font-bold">Dirección:</span> {company.address}
                  </CardDescription>
                </TableCell>
              </TableRow>
            )}
            {company?.country && (
              <TableRow>
                <TableCell>
                  <CardDescription className="capitalize">
                    <span className="font-bold">País:</span> {company.country}
                  </CardDescription>
                </TableCell>
              </TableRow>
            )}
            {company?.province_id?.name && (
              <TableRow>
                <TableCell>
                  <CardDescription className="capitalize">
                    <span className="font-bold">Provincia:</span> {company.province_id.name}
                  </CardDescription>
                </TableCell>
              </TableRow>
            )}
            {company?.contact_phone && (
              <TableRow>
                <TableCell>
                  <CardDescription>
                    <span className="font-bold">Teléfono de contacto:</span> {company.contact_phone}
                  </CardDescription>
                </TableCell>
              </TableRow>
            )}
            {company?.contact_email && (
              <TableRow>
                <TableCell>
                  <CardDescription>
                    <span className="font-bold">Email de contacto:</span> {company.contact_email}
                  </CardDescription>
                </TableCell>
              </TableRow>
            )}
            {admissionDate && (
              <TableRow>
                <TableCell>
                  <CardDescription>
                    <span className="font-bold">Fecha de alta:</span> {admissionDate}
                  </CardDescription>
                </TableCell>
              </TableRow>
            )}
            {showDescription && company?.description && (
              <TableRow>
                <TableCell>
                  <CardDescription className="capitalize">
                    <span className="font-bold">Descripción:</span> {company.description}
                  </CardDescription>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
