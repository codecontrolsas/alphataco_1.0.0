import { Badge } from '@/components/ui/badge';
import type { DocumentSummary } from '../compliance/summary';
import {
  DOCUMENT_STATUS_UI,
  TONE_TO_BADGE,
  documentStatusFromSummary,
  isDocumentStatusKey,
} from '../lib/document-status-ui';

interface DocumentStatusChipProps {
  /** Estado guardado del recurso (`status`). Si no es documental, se deriva de `summary`. */
  status: string | null | undefined;
  /** Conteo de documentos; sin él (sin permiso o cargando) solo se muestra el estado. */
  summary?: DocumentSummary | null;
}

/**
 * Estado documental del recurso en la cabecera de su ficha: chip con tono del sistema y, si hay
 * conteo, "N de M vigentes" más lo que requiere acción (vencidos, faltantes, rechazados).
 * Devuelve un fragmento para entrar en la fila de insignias de la cabecera.
 */
export function DocumentStatusChip({ status, summary }: DocumentStatusChipProps) {
  const key = isDocumentStatusKey(status) ? status : summary ? documentStatusFromSummary(summary) : null;
  if (!key) return null;

  const ui = DOCUMENT_STATUS_UI[key];
  const Icon = ui.icon;
  const pending = summary
    ? [
        summary.overdue > 0 && `${summary.overdue} ${summary.overdue === 1 ? 'vencido' : 'vencidos'}`,
        summary.missing > 0 && `${summary.missing} ${summary.missing === 1 ? 'pendiente' : 'pendientes'}`,
        summary.rejected > 0 && `${summary.rejected} ${summary.rejected === 1 ? 'rechazado' : 'rechazados'}`,
        summary.expiringSoon > 0 && `${summary.expiringSoon} ${summary.expiringSoon === 1 ? 'vence' : 'vencen'} pronto`,
      ].filter(Boolean)
    : [];

  return (
    <>
      <Badge variant={TONE_TO_BADGE[ui.tone]}>
        <Icon aria-hidden="true" />
        {ui.label}
      </Badge>
      {summary && summary.applicable > 0 && (
        <span className="text-muted-foreground text-sm">
          <span className="text-foreground font-mono font-semibold tabular-nums">
            {summary.valid} de {summary.applicable}
          </span>{' '}
          vigentes
          {pending.length > 0 && <span> · {pending.join(' · ')}</span>}
        </span>
      )}
    </>
  );
}
