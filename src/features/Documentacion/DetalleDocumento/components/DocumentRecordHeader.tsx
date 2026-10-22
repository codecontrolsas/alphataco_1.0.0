import { Badge } from '@/components/ui/badge';
import type { DocumentDetailResult } from '@/features/Documentacion/DetalleDocumento/actions/document-detail.server';
import {
  denyReasonBadgeVariant,
  documentStateBadgeVariant,
  employeeDisplayName,
  equipmentDisplayName,
  expiryLabel,
} from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import DeleteDocument from '@/features/Documentacion/shared/components/DeleteDocument';
import DownloadButton from '@/features/Documentacion/shared/components/DownloadButton';
import ReplaceDocument from '@/features/Documentacion/shared/components/ReplaceDocument';
import UpdateDocuments from '@/features/Documentacion/shared/components/UpdateDocuments';
import BackButton from '@/shared/components/common/BackButton';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { Archive, Building2, Truck, User } from 'lucide-react';

/** Recurso al que pertenece el documento, para la línea de identidad (legajo / dominio / empresa). */
function ResourceLine({ detail }: { detail: DocumentDetailResult }) {
  if (detail.resource === 'employee' && detail.document.applies) {
    const employee = detail.document.applies;
    return (
      <p className="text-muted-foreground flex items-center gap-2">
        <User className="size-4 shrink-0" aria-hidden />
        <span className="font-mono">[{employee.file}]</span>
        <span className="truncate">{employeeDisplayName(employee)}</span>
      </p>
    );
  }
  if (detail.resource === 'vehicle' && detail.document.applies) {
    return (
      <p className="text-muted-foreground flex items-center gap-2">
        <Truck className="size-4 shrink-0" aria-hidden />
        <span className="font-mono">{equipmentDisplayName(detail.document.applies)}</span>
      </p>
    );
  }
  return (
    <p className="text-muted-foreground flex items-center gap-2">
      <Building2 className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{detail.resource === 'company' ? detail.document.company?.company_name : ''}</span>
    </p>
  );
}

/**
 * Cabecera de la ficha del documento: tipo de documento, recurso, estado y vencimiento a la izquierda;
 * descargar y, con permiso de actualizar, renovar / reemplazar / eliminar a la derecha.
 */
export function DocumentRecordHeader({
  detail,
  documentId,
  canUpdate,
}: {
  detail: DocumentDetailResult;
  documentId: string;
  canUpdate: boolean;
}) {
  const { document, derived } = detail;
  const documentType = document.document_types;
  const documentPath = document.document_path ?? '';
  const typeName = documentType?.name ?? '';
  const isArchived = derived.notApplicable;
  const state = derived.state;
  const expiringSoonDays = derived.expiringSoon ? derived.daysToExpiry : null;

  return (
    <RecordHeader
      identity={
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-balance">{typeName}</h1>
          <ResourceLine detail={detail} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isArchived ? (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Archive className="size-3" /> Ya no aplica · Historial
              </Badge>
            ) : (
              <>
                {state && (
                  <Badge variant={documentStateBadgeVariant(state)} className="capitalize">
                    {state}
                  </Badge>
                )}
                {expiringSoonDays !== null && (
                  <Badge variant="outline">
                    {expiringSoonDays === 0
                      ? 'Vence hoy'
                      : `Vence en ${expiringSoonDays} ${expiringSoonDays === 1 ? 'día' : 'días'}`}
                  </Badge>
                )}
                {state && document.deny_reason && (
                  <Badge variant={denyReasonBadgeVariant(state)} className="capitalize">
                    {document.deny_reason}
                  </Badge>
                )}
                <span className="text-muted-foreground text-sm">
                  {expiryLabel(documentType?.explired, document.validity)}
                </span>
              </>
            )}
          </div>
        </div>
      }
      actions={
        <>
          <BackButton />
          <DownloadButton fileName={typeName} path={documentPath} />
          {canUpdate && (
            <>
              {!isArchived && (
                <>
                  <UpdateDocuments
                    id={documentId}
                    resource={detail.resource}
                    documentName={documentPath}
                    expires={documentType?.explired ?? false}
                    montly={documentType?.is_it_montlhy ?? false}
                  />
                  <ReplaceDocument
                    resource={detail.resource}
                    documentName={documentPath}
                    expires={document.validity ? String(document.validity) : null}
                    montly={document.period}
                    appliesId={documentId}
                  />
                </>
              )}
              <DeleteDocument id={documentId} resource={detail.resource} documentName={documentPath} />
            </>
          )}
        </>
      }
    />
  );
}
