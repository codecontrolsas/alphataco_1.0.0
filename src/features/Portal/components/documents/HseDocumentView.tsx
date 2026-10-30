import { buttonVariants } from '@/components/ui/button';
import { HSE_ACK_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import { getMyHseDocument } from '@/features/Portal/actions/hse-documents.queries';
import { requirePortalSection } from '@/features/Portal/navigation/sections.server';
import { cn } from '@/lib/utils';
import { formatArgentinaDateTime, formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import { CheckCircle2, Download, ExternalLink, FileText, XCircle } from 'lucide-react';
import { notFound } from 'next/navigation';
import { KeyValueList } from '../ui/KeyValueList';
import { PageHeader } from '../ui/PageHeader';
import { StatusBadge } from '../ui/StatusBadge';
import { HseRespondPanel } from './HseRespondPanel';

const fileAction = cn(buttonVariants({ variant: 'outline' }), 'min-h-11 justify-center');

function fileSizeText(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Un documento del empleado: datos, el PDF (embebido desde `md`; en el celular se abre aparte porque los navegadores
 * móviles no muestran PDFs embebidos) y la respuesta, al pie y sin nada fijo encima. Lo que no es suyo, ya no le aplica
 * o no existe → 404.
 */
export async function HseDocumentView({ ackId }: { ackId: string }) {
  const employee = await requirePortalSection('documents');
  const document = await getMyHseDocument(employee, ackId);
  if (!document) notFound();
  const size = fileSizeText(document.fileSize);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Mis documentos', href: '/portal/documents' }]}
        status={<StatusBadge ui={HSE_ACK_STATUS_UI[document.status]} />}
        title={document.title}
        description={document.description ?? undefined}
        className="mb-0"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {document.changeLog && document.version > 1 && (
            <p className="bg-info-subtle text-info-subtle-foreground rounded-xl p-4 text-sm text-pretty">
              <span className="font-medium">Qué cambió en esta versión:</span> {document.changeLog}
            </p>
          )}

          <section aria-labelledby="doc-file" className="space-y-3">
            <h2 id="doc-file" className="text-base font-semibold">
              Documento
            </h2>
            <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
              <span
                aria-hidden="true"
                className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-lg"
              >
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium break-words">{document.fileName ?? 'Documento PDF'}</span>
                <span className="text-muted-foreground block text-sm">PDF{size ? ` · ${size}` : ''}</span>
              </span>
              <span className="grid gap-2 sm:flex">
                <a href={document.viewUrl} target="_blank" rel="noopener noreferrer" className={fileAction}>
                  <ExternalLink aria-hidden="true" /> Abrir
                  <span className="sr-only"> el PDF (se abre en otra pestaña)</span>
                </a>
                <a href={document.downloadUrl} className={fileAction}>
                  <Download aria-hidden="true" /> Descargar
                </a>
              </span>
            </div>
            <iframe
              src={document.viewUrl}
              title={`PDF: ${document.title}`}
              className="bg-muted hidden h-[70vh] w-full rounded-xl border md:block"
            />
          </section>
        </div>

        <aside
          aria-labelledby="doc-meta"
          className="bg-card rounded-xl border p-4 lg:sticky lg:top-[calc(var(--portal-header-h)+1.5rem)]"
        >
          <h2 id="doc-meta" className="mb-3 text-base font-semibold">
            Datos
          </h2>
          <KeyValueList
            stacked
            rows={[
              { label: 'Tipo', value: document.typeName },
              { label: 'Versión', value: document.version, mono: true },
              {
                label: 'Publicado',
                value: document.publishedAt ? formatArgentinaDay(document.publishedAt) : null,
                mono: true,
              },
              {
                label: 'Vence',
                value: document.expiresAt ? formatDateAr(document.expiresAt) : 'No vence',
                mono: Boolean(document.expiresAt),
              },
            ]}
          />
        </aside>
      </div>

      {document.status === 'pending' ? (
        <HseRespondPanel ackId={document.ackId} title={document.title} />
      ) : (
        <section
          aria-labelledby="doc-answer"
          className={cn(
            'flex gap-3 rounded-xl p-4',
            document.status === 'accepted'
              ? 'bg-ok-subtle text-ok-subtle-foreground'
              : 'bg-danger-subtle text-danger-subtle-foreground'
          )}
        >
          {document.status === 'accepted' ? (
            <CheckCircle2 aria-hidden="true" className="size-6 shrink-0" />
          ) : (
            <XCircle aria-hidden="true" className="size-6 shrink-0" />
          )}
          <div className="min-w-0 space-y-1">
            <h2 id="doc-answer" className="font-semibold">
              {document.status === 'accepted' ? 'Aceptaste este documento' : 'Rechazaste este documento'}
            </h2>
            {document.respondedAt && (
              <p className="text-sm tabular-nums">{formatArgentinaDateTime(document.respondedAt)}</p>
            )}
            {document.rejectReason && <p className="text-sm text-pretty">Motivo: {document.rejectReason}</p>}
            <p className="text-sm text-pretty opacity-90">
              Si sale una versión nueva, vas a tener que leerla y responderla otra vez.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
