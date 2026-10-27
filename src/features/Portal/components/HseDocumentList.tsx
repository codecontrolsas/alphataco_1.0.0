import { getMyHseDocuments } from '@/features/Portal/actions/hse-documents.queries';
import { getPortalEmployeeForPage } from '@/features/Portal/actions/perimeter';
import { DocumentsEmptyState } from './DocumentsEmptyState';
import { HseDocumentCard } from './HseDocumentCard';

/** "Mis documentos": primero lo que falta responder, después lo ya respondido de la versión vigente. */
export async function HseDocumentList() {
  const employee = await getPortalEmployeeForPage();
  const documents = await getMyHseDocuments(employee);
  if (documents.length === 0) return <DocumentsEmptyState />;
  const pending = documents.filter((d) => d.status === 'pending');
  const answered = documents.filter((d) => d.status !== 'pending');
  return (
    <div className="space-y-8">
      <section aria-labelledby="docs-pending" className="space-y-3">
        <h2 id="docs-pending" className="font-semibold">
          Para leer y aceptar <span className="text-muted-foreground font-normal tabular-nums">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
            Estás al día: no tenés documentos pendientes.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((d) => (
              <li key={d.ackId}>
                <HseDocumentCard document={d} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {answered.length > 0 && (
        <section aria-labelledby="docs-answered" className="space-y-3">
          <h2 id="docs-answered" className="font-semibold">
            Ya respondidos <span className="text-muted-foreground font-normal tabular-nums">({answered.length})</span>
          </h2>
          <ul className="space-y-3">
            {answered.map((d) => (
              <li key={d.ackId}>
                <HseDocumentCard document={d} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function HseDocumentListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando tus documentos">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-muted h-20 animate-pulse rounded-xl motion-reduce:animate-none" />
      ))}
    </div>
  );
}
