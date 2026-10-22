import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ChecklistAnswersList } from '@/features/Checklists/ChecklistAnswers/ChecklistAnswersList';
import { ChecklistAnswersTableSkeleton } from '@/features/Checklists/ChecklistAnswers/fallback/ChecklistAnswersTableSkeleton';
import { fetchChecklistTemplateById } from '@/features/Checklists/actions/checklist-queries';
import { ChecklistPDFButton } from '@/features/Checklists/components/ChecklistPDFButton';
import { fetchCustomFormById, fetchFormsAnswersByFormId } from '@/features/Formularios/actions/form-actions';
import { LegacyAnswersList } from '@/features/Formularios/components/forms/LegacyAnswersList';
import { PDFPreviewDialog } from '@/features/Formularios/components/pdf-preview-dialog';
import { TransporteSPANAYCHKHYS01 } from '@/features/Formularios/pdf/generators/TransporteSPANAYCHKHYS01';
import { TransporteSPANAYCHKHYS03 } from '@/features/Formularios/pdf/generators/TransporteSPANAYCHKHYS03';
import { TransporteSPANAYCHKHYS04 } from '@/features/Formularios/pdf/generators/TransporteSPANAYCHKHYS04';
import { toPdfSections } from '@/features/Formularios/utils/checklistView';
import { TONE_TO_BADGE, type StatusUi } from '@/features/Mantenimiento/lib/status-presentation';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { fetchCurrentCompany } from '@/shared/actions/company.actions';
import BackButton from '@/shared/components/common/BackButton';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

const ACTIVE_UI: Record<'active' | 'inactive', StatusUi> = {
  active: { label: 'Activo', tone: 'ok', icon: CheckCircle2 },
  inactive: { label: 'Inactivo', tone: 'neutral', icon: CircleDashed },
};

const renderForm = (activeFormType: string, companyLogo?: string) => {
  switch (activeFormType) {
    case 'Transporte SP-ANAY - CHK - HYS - 01':
      return (
        <TransporteSPANAYCHKHYS01
          title="CHECK LIST MANTENIMIENTO VEHICULAR"
          description="Pdf vacio"
          companyLogo={companyLogo}
          preview
        />
      );
    case 'Transporte SP-ANAY - CHK - HYS - 03':
      return (
        <TransporteSPANAYCHKHYS03
          title="CHECK LIST INSPECCION VEHICULAR"
          description="Pdf vacio"
          companyLogo={companyLogo}
          preview
        />
      );
    case 'Transporte SP-ANAY - CHK - HYS - 04':
      return (
        <TransporteSPANAYCHKHYS04
          title="INSPERCION DIARIA DE VEHICULO"
          description="Pdf vacio"
          companyLogo={companyLogo}
          preview
        />
      );
    default:
      return <StateBlock variant="empty" title="No hay formulario seleccionado" />;
  }
};

export default async function FormDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, resolvedSearchParams, canView, canCreate] = await Promise.all([
    params,
    searchParams,
    checkPermissionServer('formularios', 'formularios', 'view'),
    checkPermissionServer('formularios', 'formularios', 'create'),
  ]);

  if (!canView) {
    return (
      <div className="space-y-6 px-4 py-4 sm:px-7">
        <BackButton />
        <StateBlock variant="noperm" title="No tenés permiso para ver formularios" />
      </div>
    );
  }

  // Intentar obtener el checklist desde la nueva estructura normalizada
  const checklistTemplate = await fetchChecklistTemplateById(id);

  // Si es un checklist normalizado → usar el nuevo DataTable
  if (checklistTemplate) {
    const status = ACTIVE_UI[checklistTemplate.is_active ? 'active' : 'inactive'];
    const StatusIcon = status.icon;

    return (
      <div className="space-y-6 px-4 py-4 sm:px-7">
        <BackButton />

        <RecordHeader
          identity={
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{checklistTemplate.name}</h1>
                <Badge variant={TONE_TO_BADGE[status.tone]}>
                  <StatusIcon className="size-3" aria-hidden="true" />
                  {status.label}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {checklistTemplate.code}
                {checklistTemplate.description ? ` · ${checklistTemplate.description}` : ''}
              </p>
            </div>
          }
          actions={
            <>
              <ChecklistPDFButton
                templateName={checklistTemplate.name}
                templateCode={checklistTemplate.code}
                sections={toPdfSections(checklistTemplate)}
              />
              {canCreate && (
                <Link className={buttonVariants({ variant: 'default' })} href={`/dashboard/forms/${id}/new`}>
                  Nueva respuesta
                </Link>
              )}
            </>
          }
        />

        <SectionCard title="Respuestas" flush>
          <Suspense fallback={<ChecklistAnswersTableSkeleton />}>
            <ChecklistAnswersList searchParams={resolvedSearchParams as DataTableSearchParams} templateId={id} />
          </Suspense>
        </SectionCard>
      </div>
    );
  }

  // Si es un formulario de la estructura antigua
  const formInfo = await fetchCustomFormById(id);

  if (formInfo.length === 0) {
    return (
      <div className="space-y-6 px-4 py-4 sm:px-7">
        <BackButton />
        <StateBlock variant="error" title="No se encontró el formulario" description={`ID: ${id}`} />
      </div>
    );
  }

  const [answers, company] = await Promise.all([fetchFormsAnswersByFormId(id), fetchCurrentCompany()]);
  const companyLogo = company?.[0]?.company_logo ?? undefined;
  const formName = formInfo[0].name;
  const formDescription = (answers[0]?.form_id?.form as { description?: string } | undefined)?.description ?? '';

  // Los formularios legacy todavía no admiten cargar respuestas nuevas: sin botón «Nueva respuesta».
  return (
    <div className="space-y-6 px-4 py-4 sm:px-7">
      <BackButton />

      <RecordHeader
        identity={
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold">{formName}</h1>
            {formDescription && <p className="text-muted-foreground text-sm">{formDescription}</p>}
          </div>
        }
        actions={
          <PDFPreviewDialog
            buttonText="Imprimir vacío"
            title={formName}
            description="Vista previa del formulario vacío"
          >
            <div className="h-full w-full bg-white">{renderForm(formName, companyLogo)}</div>
          </PDFPreviewDialog>
        }
      />

      <LegacyAnswersList answers={answers} />
    </div>
  );
}
