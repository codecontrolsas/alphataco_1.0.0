import { HseStatusBadge } from '@/features/Hse/components/HseStatusBadge';
import { HSE_ACK_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import type { PortalHseDocument } from '@/features/Portal/actions/hse-documents.queries';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

/** Tarjeta de un documento del empleado: toda la tarjeta es el enlace (área táctil grande). */
export function HseDocumentCard({ document }: { document: PortalHseDocument }) {
  const meta = [document.typeName, `Versión ${document.version}`].filter(Boolean).join(' · ');
  const when =
    document.status === 'pending'
      ? document.publishedAt
        ? `Publicado el ${formatArgentinaDay(document.publishedAt)}`
        : null
      : document.respondedAt
        ? `${document.status === 'accepted' ? 'Aceptado' : 'Rechazado'} el ${formatArgentinaDay(document.respondedAt)}`
        : null;
  return (
    <Link
      href={`/portal/documents/${document.ackId}`}
      className="bg-card hover:bg-muted/40 focus-visible:ring-ring flex min-h-16 items-center gap-3 rounded-xl border p-4 outline-none focus-visible:ring-2"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <HseStatusBadge ui={HSE_ACK_STATUS_UI[document.status]} />
        <p className="font-medium text-pretty break-words">{document.title}</p>
        <p className="text-muted-foreground text-sm">
          {meta}
          {when ? ` · ${when}` : ''}
        </p>
      </div>
      <ChevronRight aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
    </Link>
  );
}
