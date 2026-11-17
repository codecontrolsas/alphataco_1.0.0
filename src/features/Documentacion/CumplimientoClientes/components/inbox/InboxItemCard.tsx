'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { useMutation } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import moment from 'moment';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { discardInboxItem, validateInboxItem, type DocumentInboxData } from '../../actions/inbox';

type Item = DocumentInboxData['pending'][number];
type Kind = 'Persona' | 'Equipos';

/** Un documento de la bandeja: lo que se sabe (o leyó la IA), editable, y validar o descartar. */
export function InboxItemCard({ item, data, onDone }: { item: Item; data: DocumentInboxData; onDone: () => void }) {
  const ids = { kind: useId(), type: useId(), validity: useId(), period: useId() };
  const [kind, setKind] = useState<Kind | ''>(
    item.kind && data.kinds.includes(item.kind) ? item.kind : data.kinds.length === 1 ? data.kinds[0] : ''
  );
  const [resourceId, setResourceId] = useState(item.resourceId ?? '');
  const [typeId, setTypeId] = useState(item.documentTypeId ?? '');
  const [validity, setValidity] = useState(item.validity ?? '');
  const [period, setPeriod] = useState(item.period ?? '');

  const types = kind ? data.types[kind] ?? [] : [];
  const type = types.find((t) => t.id === typeId) ?? null;
  const resources = kind ? data.resources[kind] : [];

  const validate = useMutation({
    mutationFn: () =>
      validateInboxItem({
        id: item.id,
        kind: kind as Kind,
        resourceId,
        documentTypeId: typeId,
        validity: type?.hasExpiry ? validity || null : null,
        period: type?.monthly ? period || null : null,
      }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      toast.success('Documento validado y cargado');
      onDone();
    },
    onError: () => toast.error('No se pudo validar el documento'),
  });
  const discard = useMutation({
    mutationFn: () => discardInboxItem(item.id),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      toast.success('Documento descartado');
      onDone();
    },
    onError: () => toast.error('No se pudo descartar el documento'),
  });
  const busy = validate.isPending || discard.isPending;
  const missing = !kind || !resourceId || !typeId || (type?.hasExpiry && !validity) || (type?.monthly && !period);

  return (
    <li className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.fileName}</p>
          <p className="text-muted-foreground text-xs">
            {item.source === 'external'
              ? `Carga externa${item.uploaderName ? ` de ${item.uploaderName}` : ''}`
              : 'Carga con IA'}{' '}
            · {formatArgentinaDateTime(item.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="warning">Pendiente</Badge>
          {item.fileUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                Ver archivo
              </a>
            </Button>
          )}
        </div>
      </div>
      {item.reason && <p className="text-warn-subtle-foreground text-sm">{item.reason}</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.kinds.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor={ids.kind}>De</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as Kind);
                setResourceId('');
                setTypeId('');
              }}
            >
              <SelectTrigger id={ids.kind} className="w-full">
                <SelectValue placeholder="Personal o equipo" />
              </SelectTrigger>
              <SelectContent>
                {data.kinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k === 'Persona' ? 'Personal' : 'Equipo'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <span className="text-sm font-medium">{kind === 'Equipos' ? 'Equipo' : 'Persona'}</span>
          <MultiSelectCombobox
            options={resources}
            selectedValues={resourceId}
            onChange={(values) => setResourceId(values[0] ?? '')}
            maxSelections={1}
            closeOnSelect
            disabled={!kind}
            placeholder={kind ? 'Elegí' : 'Primero elegí de qué es'}
            searchPlaceholder={kind === 'Equipos' ? 'Buscar por interno o dominio' : 'Buscar por legajo o nombre'}
            emptyMessage="Sin resultados"
            aria-label={kind === 'Equipos' ? 'Equipo' : 'Persona'}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.type}>Tipo de documento</Label>
          <Select value={typeId} onValueChange={setTypeId} disabled={!kind}>
            <SelectTrigger id={ids.type} className="w-full">
              <SelectValue placeholder="Elegí el tipo" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {type?.hasExpiry && (
          <div className="space-y-1">
            <Label htmlFor={ids.validity}>Vence</Label>
            <EnhancedDatePicker
              id={ids.validity}
              date={validity ? moment(validity, 'YYYY-MM-DD').toDate() : undefined}
              setDate={(d) => setValidity(d ? moment(d).format('YYYY-MM-DD') : '')}
              placeholder="DD/MM/AAAA"
            />
          </div>
        )}
        {type?.monthly && (
          <div className="space-y-1">
            <Label htmlFor={ids.period}>Período (AAAA-MM)</Label>
            <Input id={ids.period} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-11" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" disabled={busy} onClick={() => discard.mutate()}>
          {discard.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Descartar
        </Button>
        <Button type="button" disabled={busy || Boolean(missing)} onClick={() => validate.mutate()}>
          {validate.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Validar y cargar
        </Button>
      </div>
    </li>
  );
}
