import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { ChevronLeft, Download, ExternalLink } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ComplianceList } from '../Compliance/ComplianceList/ComplianceList';
import { getHseDocumentDetail } from '../actions/queries.server';
import { ComplianceBar } from '../components/ComplianceBar';
import { HseExpiredBadge, HseStatusBadge } from '../components/HseStatusBadge';
import { HSE_DOCUMENT_STATUS_UI } from '../lib/status-presentation';
import { DocumentActions } from './components/DocumentActions';

const formatDay = (value: string | null) =>
  value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : 'Sin vencimiento';
const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(bytes / 1024)} KB`;

export async function getHseDocumentTitle(id: string) {
  const document = await getHseDocumentDetail(id).catch(() => null);
  return document ? `${document.title} | HSE` : 'Documento | HSE';
}

/** Detalle de un documento HSE: estado, acciones por permiso, destinatarios, versiones y cumplimiento. */
export async function HseDocumentDetailPage({ id, searchParams }: { id: string; searchParams: DataTableSearchParams }) {
  const [document, canView, canUpdate, canApprove, canDelete] = await Promise.all([
    getHseDocumentDetail(id),
    checkPermissionServer('hse', 'documentos-hse', 'view'),
    checkPermissionServer('hse', 'documentos-hse', 'update'),
    checkPermissionServer('hse', 'documentos-hse', 'approve'),
    checkPermissionServer('hse', 'documentos-hse', 'delete'),
  ]);
  if (!canView) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  if (!document) notFound();

  const current = document.versions.find((v) => v.isCurrent) ?? null;
  const draft = document.versions.find((v) => v.publishedAt === null) ?? null;
  const shown = current ?? draft;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/hse?tab=documentos-hse"
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Documentos HSE
      </Link>

      <RecordHeader
        identity={
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <HseStatusBadge ui={HSE_DOCUMENT_STATUS_UI[document.status]} />
              {document.type && <span className="text-sm text-muted-foreground">{document.type.name}</span>}
              {shown && <span className="text-sm tabular-nums text-muted-foreground">v{shown.version}</span>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{document.title}</h1>
            {document.description && (
              <p className="max-w-prose text-muted-foreground text-pretty">{document.description}</p>
            )}
          </div>
        }
        actions={
          <DocumentActions
            documentId={document.id}
            title={document.title}
            status={document.status}
            formValues={document.formValues}
            hasTargets={document.targets.length > 0}
            can={{ update: canUpdate, approve: canApprove, delete: canDelete }}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Versión vigente" className="lg:col-span-1">
          {shown ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Archivo</dt>
                <dd className="break-all">
                  {shown.fileName} <span className="text-muted-foreground">({formatSize(shown.fileSize)})</span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vence</dt>
                <dd className="flex flex-wrap items-center gap-1.5 tabular-nums">
                  {formatDay(shown.expiresAt)}
                  {shown.expired && document.status === 'published' && <HseExpiredBadge />}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Publicado</dt>
                <dd className="tabular-nums">
                  {shown.publishedAt ? formatArgentinaDateTime(shown.publishedAt) : 'Todavía no (borrador)'}
                </dd>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={shown.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
                >
                  <ExternalLink aria-hidden="true" className="size-4" /> Ver PDF
                </a>
                <a
                  href={shown.downloadUrl}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
                >
                  <Download aria-hidden="true" className="size-4" /> Descargar
                </a>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Sin archivo.</p>
          )}
        </SectionCard>

        <SectionCard title="A quién aplica" className="lg:col-span-1">
          {document.targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin destinatarios: no se puede publicar hasta elegir a quién aplica.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {document.targets.map((t) => (
                <li key={`${t.kind}:${t.refId ?? ''}`} className="rounded-full border bg-muted/40 px-3 py-1 text-sm">
                  {t.label}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Cumplimiento" className="lg:col-span-1">
          {document.status !== 'published' ? (
            <p className="text-sm text-muted-foreground">
              {document.status === 'draft'
                ? 'Al publicarlo, cada destinatario lo va a ver pendiente en su portal.'
                : 'Documento retirado: ya no se pide. Las respuestas quedan como constancia.'}
            </p>
          ) : document.compliance ? (
            <ComplianceBar compliance={document.compliance} />
          ) : (
            <p className="text-sm text-muted-foreground">No tenés permiso para ver el cumplimiento.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Versiones"
        description="Una versión publicada no se modifica: los cambios son una versión nueva."
        flush
      >
        <ol className="divide-y">
          {document.versions.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">
                  <span className="tabular-nums">Versión {v.version}</span>
                  {v.isCurrent && <span className="ml-2 text-sm font-normal text-ok-subtle-foreground">vigente</span>}
                  {!v.publishedAt && <span className="ml-2 text-sm font-normal text-muted-foreground">borrador</span>}
                </p>
                <p className="text-sm text-muted-foreground text-pretty">
                  {v.publishedAt ? `Publicada el ${formatArgentinaDateTime(v.publishedAt)}` : 'Sin publicar'}
                  {v.changeLog ? ` · ${v.changeLog}` : ''}
                </p>
                <p className="font-mono text-xs text-muted-foreground" title="Huella SHA-256 del PDF">
                  {v.sha256.slice(0, 16)}…
                </p>
              </div>
              <a
                href={v.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver el PDF de la versión ${v.version}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 self-start rounded-md px-2 text-sm text-brand-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 sm:self-center"
              >
                <ExternalLink aria-hidden="true" className="size-4" /> Ver PDF
              </a>
            </li>
          ))}
        </ol>
      </SectionCard>

      {document.status === 'published' && document.compliance && (
        <section aria-labelledby="hse-document-compliance" className="space-y-3">
          <h2 id="hse-document-compliance" className="text-lg font-semibold">
            Respuestas de la versión vigente
          </h2>
          <Suspense fallback={<TableSkeleton inCard columnCount={6} rowCount={6} />}>
            <ComplianceList searchParams={searchParams} tableId="hse-document-compliance" documentId={document.id} />
          </Suspense>
        </section>
      )}
    </div>
  );
}
