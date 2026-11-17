'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getDocumentInbox, uploadDocumentsToInbox } from '../../actions/inbox';
import { ExternalLinksPanel } from './ExternalLinksPanel';
import { InboxItemCard } from './InboxItemCard';

/**
 * Bandeja de entrada de documentos: carga masiva (con IA, cada archivo se clasifica y se valida solo si todo coincide),
 * lo que suben los externos por link, y la revisión de lo que quedó pendiente con el motivo a la vista.
 */
export function DocumentInboxClient() {
  const queryClient = useQueryClient();
  const fileId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const query = useQuery({ queryKey: ['document-inbox'], queryFn: () => getDocumentInbox(), staleTime: 15_000 });
  const data = query.data?.ok ? query.data : null;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['document-inbox'] });

  // Un archivo por llamada: el cuerpo de una server action tiene tope de 10 MB y cada lectura de IA tarda unos segundos.
  const upload = useMutation({
    mutationFn: async () => {
      const totals = { validated: 0, pending: 0, failed: [] as string[] };
      setProgress({ done: 0, total: files.length });
      for (const [index, file] of files.entries()) {
        try {
          const fd = new FormData();
          fd.append('files', file);
          const result = await uploadDocumentsToInbox(fd);
          if (!result.ok) totals.failed.push(`${file.name}: ${result.error}`);
          else {
            totals.validated += result.validated;
            totals.pending += result.pending;
            totals.failed.push(...result.failed);
          }
        } catch {
          totals.failed.push(`${file.name}: no se pudo subir (¿supera 10 MB?)`);
        }
        setProgress({ done: index + 1, total: files.length });
      }
      return totals;
    },
    onSuccess: (totals) => {
      const parts = [
        totals.validated > 0 && `${totals.validated} validados por la IA y cargados`,
        totals.pending > 0 && `${totals.pending} para revisar`,
      ].filter(Boolean);
      if (parts.length) toast.success(parts.join('; '));
      for (const failure of totals.failed) toast.error(failure);
      setFiles([]);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
      refresh();
    },
    onError: () => {
      setProgress(null);
      toast.error('No se pudieron subir los documentos');
    },
  });

  if (query.isPending) {
    return (
      <div className="space-y-3" role="status" aria-label="Cargando la bandeja">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError || query.data?.ok === false) {
    return (
      <StateBlock
        variant={query.data?.ok === false ? 'noperm' : 'error'}
        title={query.data?.ok === false ? 'No tenés permiso para usar la bandeja' : 'No se pudo leer la bandeja'}
        description={query.data?.ok === false ? query.data.error : 'Intentá de nuevo en unos segundos.'}
      />
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="bulk-upload" className="space-y-3">
        <h3 id="bulk-upload" className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4" aria-hidden="true" />
          Carga masiva
        </h3>
        {data.aiEnabled ? (
          <p className="text-muted-foreground text-sm">
            Subí hasta 20 archivos a la vez. La IA detecta el tipo de documento, de quién es y hasta cuándo vale, y lo
            cruza con lo cargado (CUIL, DNI, dominio). Si todo coincide lo valida sola; si no, queda abajo con el
            motivo.
          </p>
        ) : (
          <Alert variant="info">
            <AlertDescription>
              La carga con IA no está configurada en esta instancia: los archivos quedan en la bandeja para que
              completes tipo, recurso y vencimiento a mano.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor={fileId}>Archivos (PDF o imágenes)</Label>
            <Input
              ref={inputRef}
              id={fileId}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                if (chosen.length > 20) toast.error('Máximo 20 archivos por carga: se tomaron los primeros 20');
                setFiles(chosen.slice(0, 20));
              }}
            />
          </div>
          <Button type="button" disabled={files.length === 0 || upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {upload.isPending
              ? `${data.aiEnabled ? 'Leyendo con IA' : 'Subiendo'} ${progress ? `${progress.done}/${progress.total}` : ''}…`
              : `Subir${files.length ? ` ${files.length}` : ''}${data.aiEnabled ? ' y clasificar' : ''}`}
          </Button>
        </div>
      </section>

      <Separator />

      <section aria-labelledby="inbox-pending" className="space-y-3">
        <h3 id="inbox-pending" className="text-base font-semibold">
          Pendientes de validar{' '}
          <span className="text-muted-foreground font-mono tabular-nums">({data.pending.length})</span>
        </h3>
        {data.pending.length === 0 ? (
          <StateBlock
            variant="empty"
            title="Nada pendiente"
            description="Todo lo que llegó a la bandeja ya se validó o descartó."
          />
        ) : (
          <ul className="space-y-3">
            {data.pending.map((item) => (
              <InboxItemCard key={item.id} item={item} data={data} onDone={refresh} />
            ))}
          </ul>
        )}
      </section>

      {data.recent.length > 0 && (
        <section aria-labelledby="inbox-recent" className="space-y-2">
          <h3 id="inbox-recent" className="text-sm font-semibold">
            Últimos resueltos
          </h3>
          <ul className="divide-y rounded-md border text-sm">
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Badge variant={r.status === 'validated' ? 'success' : 'secondary'}>
                  {r.status === 'validated' ? 'Validado' : 'Descartado'}
                </Badge>
                <span className="min-w-0 flex-1 truncate">
                  {r.documentTypeName ?? r.fileName}
                  {r.resourceLabel ? ` · ${r.resourceLabel}` : ''}
                </span>
                <span className="text-muted-foreground text-xs">
                  {r.source === 'external' ? 'Externo' : 'IA'} ·{' '}
                  {r.reviewedAt ? formatArgentinaDateTime(r.reviewedAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Separator />
      <ExternalLinksPanel />
    </div>
  );
}
