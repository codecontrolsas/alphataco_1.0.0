import { HSE_ACK_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import { getMyHseDocuments, type PortalHseDocument } from '@/features/Portal/actions/hse-documents.queries';
import { PortalListSkeleton } from '@/features/Portal/fallback/PortalListSkeleton';
import { requirePortalSection } from '@/features/Portal/navigation/sections.server';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { CheckCircle2, FileText, Inbox } from 'lucide-react';
import { Suspense } from 'react';
import { DataList, type DataListItem } from '../ui/DataList';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { SectionCard } from '../ui/SectionCard';
import { StatusBadge } from '../ui/StatusBadge';

function documentItem(d: PortalHseDocument): DataListItem {
  const when =
    d.status === 'pending'
      ? d.publishedAt
        ? `publicado el ${formatArgentinaDay(d.publishedAt)}`
        : null
      : d.respondedAt
        ? `respondido el ${formatArgentinaDay(d.respondedAt)}`
        : null;
  return {
    key: d.ackId,
    href: `/portal/documents/${d.ackId}`,
    leading: <FileText className="size-5" />,
    title: d.title,
    meta: [d.typeName, `Versión ${d.version}`, when].filter(Boolean).join(' · '),
    aside: <StatusBadge ui={HSE_ACK_STATUS_UI[d.status]} />,
  };
}

/** "Mis documentos": encabezado inmediato y la lista en su propio Suspense. */
export function PortalDocumentsPage() {
  return (
    <>
      <PageHeader title="Mis documentos" description="Normas y procedimientos que la empresa te pide leer y aceptar." />
      <Suspense fallback={<PortalListSkeleton label="Cargando tus documentos" />}>
        <HseDocumentList />
      </Suspense>
    </>
  );
}

/** Primero lo que falta responder, después lo ya respondido de la versión vigente. */
async function HseDocumentList() {
  const employee = await requirePortalSection('documents');
  const documents = await getMyHseDocuments(employee);
  if (documents.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        headingLevel="h2"
        title="No tenés documentos para leer"
        description="Cuando la empresa te asigne normas, procedimientos u otros documentos para leer y aceptar, van a aparecer acá."
      />
    );
  }
  const pending = documents.filter((d) => d.status === 'pending');
  const answered = documents.filter((d) => d.status !== 'pending');
  return (
    <div className="space-y-8">
      <SectionCard id="docs-pending" title="Para leer y aceptar" count={pending.length} bare={pending.length > 0}>
        {pending.length > 0 ? (
          <DataList items={pending.map(documentItem)} />
        ) : (
          <EmptyState
            compact
            tone="success"
            icon={CheckCircle2}
            title="Estás al día"
            description="Respondiste todos los documentos que te asignaron."
          />
        )}
      </SectionCard>
      {answered.length > 0 && (
        <SectionCard id="docs-answered" title="Ya respondidos" count={answered.length} bare>
          <DataList items={answered.map(documentItem)} />
        </SectionCard>
      )}
    </div>
  );
}
