import { Card, CardDescription } from '@/components/ui/card';
import DeleteDocument from '@/features/Documentacion/shared/components/DeleteDocument';
import ReplaceDocument from '@/features/Documentacion/shared/components/ReplaceDocument';
import UpdateDocuments from '@/features/Documentacion/shared/components/UpdateDocuments';
import type { DocumentResourceKind } from '@/features/Documentacion/shared/lib/document-scope';

interface DocumentActionsCardProps {
  documentId: string;
  resource: DocumentResourceKind;
  documentName: string;
  /** Del tipo de documento: si vence y si es mensual. */
  expires: boolean;
  monthly: boolean;
  /** Del documento cargado: vencimiento y período actuales. */
  currentValidity: string | null;
  currentPeriod: string | null;
  /** El tipo ya no aplica al recurso: el documento es historial, solo se puede eliminar. */
  notApplicable?: boolean;
}

/** Tab "Actualizar" del detalle: renovar, reemplazar o eliminar el archivo del documento. */
export function DocumentActionsCard({
  documentId,
  resource,
  documentName,
  expires,
  monthly,
  currentValidity,
  currentPeriod,
  notApplicable = false,
}: DocumentActionsCardProps) {
  return (
    <Card>
      <div className="p-3 text-center space-y-3">
        <CardDescription>
          {notApplicable
            ? 'Este documento ya no aplica al recurso: se conserva como historial y solo puede eliminarse.'
            : 'Si el documento es rechazado, vencido o necesita ser actualizado puedes hacerlo desde aquí, una vez aprobado el documento no podrá ser modificado'}
        </CardDescription>
        <div className="w-full flex justify-evenly flex-wrap">
          {!notApplicable && (
            <>
              <UpdateDocuments
                id={documentId}
                resource={resource}
                documentName={documentName}
                expires={expires}
                montly={monthly}
              />
              <ReplaceDocument
                id={documentId}
                resource={resource}
                documentName={documentName}
                expires={currentValidity}
                montly={currentPeriod}
                appliesId={documentId}
              />
            </>
          )}
          <DeleteDocument id={documentId} resource={resource} documentName={documentName} expires={expires} />
        </div>
      </div>
    </Card>
  );
}
