import { Badge } from '@/components/ui/badge';
import { CardHeader, CardTitle } from '@/components/ui/card';
import {
  denyReasonBadgeVariant,
  documentStateBadgeVariant,
} from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import DownloadButton from '@/features/Documentacion/shared/components/DownloadButton';
import BackButton from '@/shared/components/common/BackButton';
import { Archive } from 'lucide-react';

interface DocumentDetailHeaderProps {
  documentTypeName: string;
  documentPath: string;
  state: string | null;
  denyReason: string | null;
  /** Días hasta el vencimiento si el documento vigente vence pronto; `null` si no corresponde avisar. */
  expiringSoonDays?: number | null;
  /** 358: un documento archivado ya no aplica al recurso; se muestra como historial, sin vigencia. */
  isArchived: boolean;
}

/** Encabezado del detalle: nombre del tipo de documento, estado y acciones de descarga/volver. */
export function DocumentDetailHeader({
  documentTypeName,
  documentPath,
  state,
  denyReason,
  expiringSoonDays = null,
  isArchived,
}: DocumentDetailHeaderProps) {
  return (
    <div className="flex flex-col">
      <div>
        <CardHeader>
          <CardTitle className="text-2xl">{documentTypeName}</CardTitle>

          {isArchived ? (
            <Badge variant="secondary" className="mb-3 w-fit flex items-center gap-1">
              <Archive className="h-3 w-3" /> Ya no aplica · Historial
            </Badge>
          ) : (
            state && (
              <div className="flex flex-col">
                <Badge variant={documentStateBadgeVariant(state)} className="mb-3 capitalize w-fit">
                  {state}
                </Badge>
                {expiringSoonDays !== null && (
                  <Badge variant="outline" className="mb-3 w-fit">
                    {expiringSoonDays === 0
                      ? 'Vence hoy'
                      : `Vence en ${expiringSoonDays} ${expiringSoonDays === 1 ? 'día' : 'días'}`}
                  </Badge>
                )}
                {denyReason && (
                  <Badge variant={denyReasonBadgeVariant(state)} className="mb-3 capitalize w-fit">
                    {denyReason}
                  </Badge>
                )}
              </div>
            )
          )}
        </CardHeader>
      </div>
      <div className="flex justify-between mb-5 px-2">
        <DownloadButton fileName={documentTypeName} path={documentPath} />
        <BackButton />
      </div>
    </div>
  );
}
