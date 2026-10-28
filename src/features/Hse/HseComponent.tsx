import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { sectionTab } from '@/features/TabsManager/section-tab';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { SectionTableSkeleton } from '@/shared/components/skeletons/SectionTableSkeleton';
import { FileSignature, FileText, GraduationCap, ListChecks } from 'lucide-react';
import ComplianceTabContent from './Compliance/ComplianceTabContent';
import DocumentsTabContent from './Documents/DocumentsTabContent';
import RecordsTabContent from './Records/RecordsTabContent';
import TrainingsTabContent from './Trainings/TrainingsTabContent';

/**
 * Módulo HSE (ticket 804, fase 2: documentos). Secciones elegidas desde el sidebar (`?tab=`); los íconos son los de
 * `SUB_ITEM_ICONS` en `navigation.ts`. La fase 3 suma Capacitaciones (material y examen corregido en el servidor). La configuración de tipos de
 * documento HSE vive en Configuración → Tipos de documento → HSE.
 */
export default async function HseComponent({ searchParams }: { searchParams: DataTableSearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="documentos-hse"
      permissions={permissions}
      tabs={[
        sectionTab({
          moduleSlug: 'hse',
          tabSlug: 'documentos-hse',
          icon: FileText,
          text: 'Documentos',
          fallback: <SectionTableSkeleton filterCount={3} />,
          children: <DocumentsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'hse',
          tabSlug: 'capacitaciones',
          icon: GraduationCap,
          text: 'Capacitaciones',
          fallback: <SectionTableSkeleton filterCount={3} />,
          children: <TrainingsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'hse',
          tabSlug: 'cumplimiento',
          icon: ListChecks,
          text: 'Cumplimiento',
          fallback: <SectionTableSkeleton filterCount={3} />,
          children: <ComplianceTabContent searchParams={searchParams} permissions={permissions} />,
        }),
        sectionTab({
          moduleSlug: 'hse',
          tabSlug: 'actas',
          icon: FileSignature,
          text: 'Actas',
          fallback: <SectionTableSkeleton filterCount={3} />,
          children: <RecordsTabContent searchParams={searchParams} permissions={permissions} />,
        }),
      ]}
    />
  );
}
