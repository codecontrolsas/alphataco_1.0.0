import { Card } from '@/components/ui/card';
import { getDocumentDetail } from '@/features/Documentacion/DetalleDocumento/actions/document-detail.server';
import { CompanyInfoCard } from '@/features/Documentacion/DetalleDocumento/components/CompanyInfoCard';
import { DocumentPreview } from '@/features/Documentacion/DetalleDocumento/components/DocumentPreview';
import { DocumentRecordHeader } from '@/features/Documentacion/DetalleDocumento/components/DocumentRecordHeader';
import { DocumentTypeCard } from '@/features/Documentacion/DetalleDocumento/components/DocumentTypeCard';
import { EmployeeInfoCard } from '@/features/Documentacion/DetalleDocumento/components/EmployeeInfoCard';
import { EquipmentInfoCard } from '@/features/Documentacion/DetalleDocumento/components/EquipmentInfoCard';
import { resourceLabel } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { MISSING_ROW_PREFIX } from '@/features/Documentacion/shared/compliance/server/document-entries.server';
import { checkPermissionServer, getUserPermissionsMapServer } from '@/features/Permissions';
import { RecordSectionsServer, type RecordSectionDefinition } from '@/features/TabsManager/RecordSectionsServer';
import BackButton from '@/shared/components/common/BackButton';
import { Archive, Building2, FileSearch, FileText, Truck, User } from 'lucide-react';

interface DocumentDetailSectionProps {
  documentId: string;
  searchParams: Promise<{ resource?: string; [key: string]: string | string[] | undefined }>;
}

/** Mensaje a pantalla completa dentro de la tarjeta del detalle. */
function DocumentDetailMessage({ title, description }: { title: string; description: string }) {
  return (
    <section>
      <Card className="p-4">
        <div className="flex items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <p className="text-muted-foreground font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
            <div className="pt-2">
              <BackButton />
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

/**
 * Ficha de un documento (`/dashboard/document/[id]`): cabecera con tipo, recurso, estado y acciones
 * (descargar, renovar, reemplazar, eliminar) y secciones Archivo / Documento / recurso / Empresa.
 *
 * Perímetro: el documento lo resuelve `getDocumentDetail`, que se apoya en las lecturas acotadas
 * a la empresa activa (`document-actions`). La página nunca manda `company_id` ni arma queries.
 */
export async function DocumentDetailSection({ documentId, searchParams }: DocumentDetailSectionProps) {
  const resolvedSearchParams = await searchParams;
  const resourceParam = typeof resolvedSearchParams.resource === 'string' ? resolvedSearchParams.resource : undefined;

  const [permissions, canView, canUpdate] = await Promise.all([
    getUserPermissionsMapServer(),
    checkPermissionServer('documentacion', 'detalle-de-documento', 'view'),
    checkPermissionServer('documentacion', 'detalle-de-documento', 'update'),
  ]);

  if (!canView) {
    return <DocumentDetailMessage title="Sin acceso" description="No tienes permisos para ver esta sección." />;
  }

  // Una exigencia faltante no tiene ficha: todavía no hay documento cargado. Se sube desde la lista.
  if (documentId.startsWith(MISSING_ROW_PREFIX)) {
    return (
      <DocumentDetailMessage
        title="Documento todavía no cargado"
        description="Este documento aún no fue subido, por eso no tiene detalle. Subilo desde la lista de documentos con el botón «Subir»."
      />
    );
  }

  const detail = await getDocumentDetail(documentId, resourceParam);

  if (!detail) {
    return (
      <DocumentDetailMessage
        title="Documento no encontrado"
        description="El documento no existe (pudo haber sido eliminado), todavía no tiene archivo o no pertenece a la empresa activa."
      />
    );
  }

  const { document, fileUrl } = detail;
  const documentType = document.document_types;
  const isCompanyDocument = detail.resource === 'company';
  // "Ya no aplica" es derivado: el tipo hoy no le aplica al recurso (cambió su función o condición).
  // Se muestra como historial, sin estado de vigencia. El estado también es derivado (vencido por fecha).
  const isArchived = detail.derived.notApplicable;

  const sections: RecordSectionDefinition<'documentacion'>[] = [
    {
      value: 'archivo',
      aliases: ['Actualizar'],
      label: 'Archivo',
      icon: <FileSearch className="size-4" />,
      content: <DocumentPreview fileUrl={fileUrl} />,
    },
    {
      value: 'Documento',
      label: 'Documento',
      icon: <FileText className="size-4" />,
      moduleSlug: 'documentacion',
      tabSlug: 'detalle-doc-documento',
      content: (
        <DocumentTypeCard
          documentType={documentType}
          isCompanyDocument={isCompanyDocument}
          validity={document.validity}
          createdAt={document.created_at}
          period={document.period}
        />
      ),
    },
  ];

  if (detail.resource === 'employee' && detail.document.applies) {
    sections.push({
      value: 'Empleado',
      label: resourceLabel('employee'),
      icon: <User className="size-4" />,
      moduleSlug: 'documentacion',
      tabSlug: 'detalle-doc-empleado',
      content: <EmployeeInfoCard employee={detail.document.applies} />,
    });
  }

  if (detail.resource === 'vehicle' && detail.document.applies) {
    sections.push({
      value: 'Empleado',
      aliases: ['Equipo'],
      label: resourceLabel('vehicle'),
      icon: <Truck className="size-4" />,
      moduleSlug: 'documentacion',
      tabSlug: 'detalle-doc-empleado',
      content: <EquipmentInfoCard vehicle={detail.document.applies} />,
    });
  }

  sections.push({
    value: 'Empresa',
    label: 'Empresa',
    icon: <Building2 className="size-4" />,
    moduleSlug: 'documentacion',
    tabSlug: 'detalle-doc-empresa',
    content:
      detail.resource === 'company' ? (
        <CompanyInfoCard
          company={detail.document.company}
          description="Datos de la empresa a la que pertenece este documento"
        />
      ) : (
        <CompanyInfoCard
          company={detail.document.applies?.company_id ?? null}
          description="Datos de la empresa que solicita el documento"
          dateOfAdmission={detail.resource === 'employee' ? detail.document.applies?.date_of_admission : null}
          showDescription
        />
      ),
  });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DocumentRecordHeader detail={detail} documentId={documentId} canUpdate={canUpdate} />
      {isArchived && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <Archive className="mt-0.5 size-4 shrink-0" />
          <span>
            Este documento <strong>ya no aplica</strong> al recurso (cambió su función o condición). Se conserva a modo
            de <strong>historial</strong>: no se solicita ni cuenta para la documentación vigente.
          </span>
        </div>
      )}
      <RecordSectionsServer<'documentacion'>
        paramName="tab"
        searchParams={resolvedSearchParams}
        permissions={permissions}
        defaultSection="archivo"
        preserveParams={['resource']}
        ariaLabel="Secciones del documento"
        sections={sections}
      />
    </div>
  );
}
