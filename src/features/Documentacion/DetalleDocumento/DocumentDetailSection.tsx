import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDocumentDetail } from '@/features/Documentacion/DetalleDocumento/actions/document-detail.server';
import { CompanyInfoCard } from '@/features/Documentacion/DetalleDocumento/components/CompanyInfoCard';
import { DocumentActionsCard } from '@/features/Documentacion/DetalleDocumento/components/DocumentActionsCard';
import { DocumentDetailHeader } from '@/features/Documentacion/DetalleDocumento/components/DocumentDetailHeader';
import { DocumentPreview } from '@/features/Documentacion/DetalleDocumento/components/DocumentPreview';
import { DocumentTypeCard } from '@/features/Documentacion/DetalleDocumento/components/DocumentTypeCard';
import { EmployeeInfoCard } from '@/features/Documentacion/DetalleDocumento/components/EmployeeInfoCard';
import { EquipmentInfoCard } from '@/features/Documentacion/DetalleDocumento/components/EquipmentInfoCard';
import { resourceLabel } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { MISSING_ROW_PREFIX } from '@/features/Documentacion/shared/compliance/server/document-entries.server';
import { checkPermissionServer, getUserPermissionsMapServer } from '@/features/Permissions';
import { TabsManagerServer, type TabDefinition } from '@/features/TabsManager';
import BackButton from '@/shared/components/common/BackButton';
import { Archive, Building2, FileText, User, Wrench } from 'lucide-react';
import { Suspense } from 'react';

interface DocumentDetailSectionProps {
  documentId: string;
  searchParams: Promise<{ resource?: string; [key: string]: string | string[] | undefined }>;
}

/** Mensaje a pantalla completa dentro de la tarjeta del detalle. */
function DocumentDetailMessage({ title, description }: { title: string; description: string }) {
  return (
    <section className="md:mx-2">
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
 * Detalle de un documento (`/dashboard/document/[id]`): datos de la empresa, del recurso y del
 * documento, más las acciones de actualización y el visor del archivo.
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
  const documentPath = document.document_path ?? '';
  const isCompanyDocument = detail.resource === 'company';
  // "Ya no aplica" es derivado: el tipo hoy no le aplica al recurso (cambió su función o condición).
  // Se muestra como historial, sin estado de vigencia. El estado también es derivado (vencido por fecha).
  const { derived } = detail;
  const isArchived = derived.notApplicable;

  const tabs: TabDefinition<'documentacion'>[] = [];

  tabs.push({
    value: 'Empresa',
    label: (
      <span className="flex items-center gap-2">
        <Building2 className="h-4 w-4" />
        Empresa
      </span>
    ),
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

  if (detail.resource === 'employee' && detail.document.applies) {
    tabs.push({
      value: 'Empleado',
      label: (
        <span className="flex items-center gap-2">
          <User className="h-4 w-4" />
          {resourceLabel('employee')}
        </span>
      ),
      moduleSlug: 'documentacion',
      tabSlug: 'detalle-doc-empleado',
      content: <EmployeeInfoCard employee={detail.document.applies} />,
    });
  }

  if (detail.resource === 'vehicle' && detail.document.applies) {
    tabs.push({
      value: 'Empleado',
      label: (
        <span className="flex items-center gap-2">
          <User className="h-4 w-4" />
          {resourceLabel('vehicle')}
        </span>
      ),
      moduleSlug: 'documentacion',
      tabSlug: 'detalle-doc-empleado',
      content: <EquipmentInfoCard vehicle={detail.document.applies} />,
    });
  }

  tabs.push({
    value: 'Documento',
    label: (
      <span className="flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Documento
      </span>
    ),
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
  });

  if (canUpdate) {
    tabs.push({
      value: 'Actualizar',
      label: (
        <span className="flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Actualizar
        </span>
      ),
      content: (
        <DocumentActionsCard
          documentId={documentId}
          resource={detail.resource}
          documentName={documentPath}
          expires={documentType?.explired ?? false}
          monthly={documentType?.is_it_montlhy ?? false}
          currentValidity={document.validity ? String(document.validity) : null}
          currentPeriod={document.period}
          notApplicable={isArchived}
        />
      ),
    });
  }

  return (
    <section className="md:mx-2">
      <Card className="p-4 px-2">
        {isArchived && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <Archive className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Este documento <strong>ya no aplica</strong> al recurso (cambió su función o condición). Se conserva a
              modo de <strong>historial</strong>: no se solicita ni cuenta para la documentación vigente.
            </span>
          </div>
        )}
        <div className="grid lg:grid-cols-3 grid-cols-1 gap-col-3">
          <div className="lg:max-w-[30vw] col-span-1">
            <DocumentDetailHeader
              documentTypeName={documentType?.name ?? ''}
              documentPath={documentPath}
              state={derived.state}
              expiringSoonDays={derived.expiringSoon ? derived.daysToExpiry : null}
              denyReason={document.deny_reason}
              isArchived={isArchived}
            />
            <div className="w-full px-2">
              <TabsManagerServer
                paramName="tab"
                searchParams={resolvedSearchParams}
                defaultTab="Documento"
                permissions={permissions}
                tabs={tabs}
              />
            </div>
          </div>
          <Suspense fallback={<Skeleton className="w-full h-full mt-5" />}>
            <DocumentPreview fileUrl={fileUrl} />
          </Suspense>
        </div>
      </Card>
    </section>
  );
}
