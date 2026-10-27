import { FileText } from 'lucide-react';

/**
 * "Mis documentos" en la fase 1: todavía no hay documentos HSE (llegan en la fase 2). Es un estado vacío HONESTO: no se
 * inventan filas de ejemplo (el portal viejo tenía maquetas con datos fijos que parecían funcionar y no funcionaban).
 */
export function DocumentsEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? 'flex items-start gap-3'
          : 'flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center'
      }
    >
      <span className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
        <FileText aria-hidden="true" className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">No tenés documentos para leer</p>
        <p className="text-muted-foreground text-sm text-pretty">
          Cuando la empresa te asigne normas, procedimientos u otros documentos para leer y aceptar, van a aparecer acá.
        </p>
      </div>
    </div>
  );
}
