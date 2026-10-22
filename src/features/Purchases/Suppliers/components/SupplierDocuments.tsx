'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Logger } from '@/lib/logger';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { argentinaDate, formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileUp, History, RefreshCw } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { uploadSupplierDocument, type SupplierDetail } from '../../actions/suppliers.server';
import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';
import { SUPPLIER_DOCUMENT_MAX_BYTES, SUPPLIER_DOCUMENT_TYPES } from '../../schemas/suppliers';

const logger = new Logger('Purchases/SupplierDocuments');

type SupplierDocument = SupplierDetail['documents'][number];

/** Formulario del dialogo (solo cliente: el archivo no viaja por Zod al servidor, va en el FormData). */
const uploadFormSchema = z.object({
  name: z.string().trim().min(1, 'Indicá qué documento es').max(150, 'Máximo 150 caracteres'),
  file: z
    .instanceof(File, { message: 'Elegí el archivo' })
    .refine((f) => f.size <= SUPPLIER_DOCUMENT_MAX_BYTES, 'El archivo supera los 10 MB')
    .refine((f) => (SUPPLIER_DOCUMENT_TYPES as readonly string[]).includes(f.type), 'Tiene que ser PDF o imagen')
    .nullable()
    .refine((f) => f !== null, 'Elegí el archivo'),
  expiresAt: z.date().optional(),
});
type UploadFormValues = z.infer<typeof uploadFormSchema>;

/** Dias que faltan para el vencimiento (negativo = vencido). `null` sin vencimiento. */
function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return moment(expiresAt, 'YYYY-MM-DD').diff(moment(argentinaDate(), 'YYYY-MM-DD'), 'days');
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const days = daysLeft(expiresAt);
  if (days === null) return <Badge variant="outline">Sin vencimiento</Badge>;
  const date = formatDateAr(expiresAt as string);
  if (days < 0) return <Badge variant="destructive">Vencido el {date}</Badge>;
  if (days <= 30) {
    return (
      <Badge variant="warning">
        Vence en {days === 0 ? 'hoy' : `${days} ${days === 1 ? 'día' : 'días'}`} ({date})
      </Badge>
    );
  }
  return <Badge variant="success">Vigente · vence el {date}</Badge>;
}

interface Props {
  supplierId: string;
  documents: SupplierDocument[];
  nameSuggestions: string[];
  canUpdate: boolean;
}

/** Documentos del proveedor: vigentes con su vencimiento, reemplazo y el historial de reemplazados. */
export function SupplierDocuments({ supplierId, documents, nameSuggestions, canUpdate }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const listId = useId();
  const [showHistory, setShowHistory] = useState(false);
  // `null` = cerrado; `'new'` = documento nuevo; un documento = reemplazarlo.
  const [target, setTarget] = useState<SupplierDocument | 'new' | null>(null);
  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: { name: '', file: null, expiresAt: undefined },
  });

  const current = documents.filter((d) => !d.replaced_by_id);
  const replaced = documents.filter((d) => d.replaced_by_id);

  const open = (next: SupplierDocument | 'new') => {
    form.reset({ name: next === 'new' ? '' : next.name, file: null, expiresAt: undefined });
    setTarget(next);
  };

  const upload = useMutation({
    mutationFn: async (values: UploadFormValues) => {
      const data = new FormData();
      data.set('file', values.file as File);
      data.set('name', values.name);
      data.set('expiresAt', values.expiresAt ? moment(values.expiresAt).format('YYYY-MM-DD') : '');
      data.set('replacesId', target && target !== 'new' ? target.id : '');
      return unwrapAction(await uploadSupplierDocument(supplierId, data));
    },
    onSuccess: (_data, values) => {
      toast.success(target === 'new' ? `Documento ${values.name} cargado` : `Documento ${values.name} reemplazado`);
      setTarget(null);
      void queryClient.invalidateQueries({ queryKey: PURCHASES_QUERY_KEYS.suppliers });
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al subir el documento del proveedor', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo subir el documento');
    },
  });

  const row = (doc: SupplierDocument, historical: boolean) => (
    <li key={doc.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className={historical ? 'text-muted-foreground' : 'font-medium'}>{doc.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {doc.file_name} · {doc.uploadedBy} · {formatArgentinaDay(doc.uploadedAt)}
        </p>
      </div>
      {historical ? <Badge variant="outline">Reemplazado</Badge> : <ExpiryBadge expiresAt={doc.expiresAt} />}
      <Button asChild type="button" size="sm" variant="ghost">
        <a href={doc.url} target="_blank" rel="noreferrer">
          <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />
          Ver
        </a>
      </Button>
      {!historical && canUpdate && (
        <Button type="button" size="sm" variant="ghost" onClick={() => open(doc)}>
          <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
          Reemplazar
        </Button>
      )}
    </li>
  );

  return (
    <SectionCard
      title="Documentos"
      description="Constancias de ARCA, IIBB, seguros… con su vencimiento."
      action={
        canUpdate ? (
          <Button type="button" size="sm" variant="outline" onClick={() => open('new')}>
            <FileUp className="mr-1 h-4 w-4" aria-hidden="true" />
            Cargar documento
          </Button>
        ) : undefined
      }
    >
      {current.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin documentos cargados.</p>
      ) : (
        <ul className="divide-y">{current.map((d) => row(d, false))}</ul>
      )}
      {replaced.length > 0 && (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="-ml-2"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
          >
            <History className="mr-1 h-4 w-4" aria-hidden="true" />
            {showHistory ? 'Ocultar reemplazados' : `Ver reemplazados (${replaced.length})`}
          </Button>
          {showHistory && <ul className="divide-y">{replaced.map((d) => row(d, true))}</ul>}
        </div>
      )}

      <Dialog open={target !== null} onOpenChange={(isOpen) => !isOpen && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{target === 'new' ? 'Cargar documento' : `Reemplazar ${target?.name ?? ''}`}</DialogTitle>
            {target !== 'new' && (
              <DialogDescription>El documento actual queda en el historial; su archivo no se borra.</DialogDescription>
            )}
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => upload.mutate(values))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Documento</FormLabel>
                    <FormControl>
                      <Input list={listId} placeholder="Constancia de inscripción ARCA, IIBB, seguro…" {...field} />
                    </FormControl>
                    <datalist id={listId}>
                      {nameSuggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="file"
                render={({ field: { onChange, value: _value, ...field } }) => (
                  <FormItem>
                    <FormLabel>Archivo (PDF o imagen, hasta 10 MB)</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept={SUPPLIER_DOCUMENT_TYPES.join(',')}
                        {...field}
                        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vence (opcional)</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker date={field.value} setDate={field.onChange} placeholder="DD/MM/AAAA" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={upload.isPending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={upload.isPending}>
                  {upload.isPending ? 'Subiendo…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
