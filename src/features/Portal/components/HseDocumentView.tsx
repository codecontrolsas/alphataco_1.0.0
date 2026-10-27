import { HseStatusBadge } from '@/features/Hse/components/HseStatusBadge';
import { HSE_ACK_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import { getMyHseDocument } from '@/features/Portal/actions/hse-documents.queries';
import { getPortalEmployeeForPage } from '@/features/Portal/actions/perimeter';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { ChevronLeft, Download, ExternalLink } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HseRespondPanel } from './HseRespondPanel';

const actionLink =
  'focus-visible:ring-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2';

/**
 * Un documento del empleado: datos, el PDF (embebido desde `md`; en el celular se abre aparte porque los navegadores
 * móviles no muestran PDFs embebidos) y la respuesta. Lo que no es suyo, ya no le aplica o no existe → 404.
 */
export async function HseDocumentView({ ackId }: { ackId: string }) {
  const employee = await getPortalEmployeeForPage();
  const document = await getMyHseDocument(employee, ackId);
  if (!document) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/portal/documents"
        className="focus-visible:ring-ring text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-2"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Mis documentos
      </Link>

      <header className="space-y-2">
        <HseStatusBadge ui={HSE_ACK_STATUS_UI[document.status]} />
        <h1 className="text-2xl font-semibold tracking-tight text-balance break-words">{document.title}</h1>
        <p className="text-muted-foreground text-sm">
          {[document.typeName, `Versión ${document.version}`].filter(Boolean).join(' · ')}
          {document.publishedAt ? ` · publicada el ${formatArgentinaDay(document.publishedAt)}` : ''}
          {document.expiresAt ? ` · vence el ${moment(document.expiresAt, 'YYYY-MM-DD').format('DD/MM/YYYY')}` : ''}
        </p>
        {document.description && <p className="text-pretty">{document.description}</p>}
        {document.changeLog && document.version > 1 && (
          <p className="bg-muted/50 rounded-lg p-3 text-sm text-pretty">
            <span className="font-medium">Qué cambió en esta versión:</span> {document.changeLog}
          </p>
        )}
      </header>

      <section aria-labelledby="doc-file" className="space-y-3">
        <h2 id="doc-file" className="sr-only">
          Documento
        </h2>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <a href={document.viewUrl} target="_blank" rel="noopener noreferrer" className={actionLink}>
            <ExternalLink aria-hidden="true" className="size-4" /> Abrir el PDF
          </a>
          <a href={document.downloadUrl} className={actionLink}>
            <Download aria-hidden="true" className="size-4" /> Descargar
          </a>
        </div>
        <iframe
          src={document.viewUrl}
          title={`PDF: ${document.title}`}
          className="bg-muted hidden h-[70vh] w-full rounded-xl border md:block"
        />
      </section>

      {document.status === 'pending' ? (
        <HseRespondPanel ackId={document.ackId} title={document.title} />
      ) : (
        <section aria-labelledby="doc-answer" className="bg-card space-y-1 rounded-xl border p-4">
          <h2 id="doc-answer" className="font-medium">
            {document.status === 'accepted' ? 'Aceptaste este documento' : 'Rechazaste este documento'}
          </h2>
          {document.respondedAt && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {formatArgentinaDateTime(document.respondedAt)}
            </p>
          )}
          {document.rejectReason && <p className="text-sm text-pretty">Motivo: {document.rejectReason}</p>}
          <p className="text-muted-foreground text-sm text-pretty">
            Si sale una versión nueva, vas a tener que leerla y responderla otra vez.
          </p>
        </section>
      )}
    </div>
  );
}
