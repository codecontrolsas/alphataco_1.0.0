'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  createExternalUploadLink,
  getExternalUploadLinks,
  revokeExternalUploadLink,
} from '../../actions/external-links';

const SCOPE_LABEL = { Persona: 'Personal', Equipos: 'Equipos', Ambos: 'Personal y equipos' } as const;
const STATE_UI = {
  active: { label: 'Activo', variant: 'success' },
  expired: { label: 'Vencido', variant: 'secondary' },
  revoked: { label: 'Revocado', variant: 'destructive' },
} as const;

/**
 * Links de carga externa: un estudio contable o una consultora sube documentos sin ser usuario. Lo que suben llega a
 * esta bandeja para validarlo. El link se ve completo una sola vez, al crearlo.
 */
export function ExternalLinksPanel() {
  const queryClient = useQueryClient();
  const labelId = useId();
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<'Persona' | 'Equipos' | 'Ambos'>('Persona');
  const [days, setDays] = useState('30');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['external-upload-links'], queryFn: () => getExternalUploadLinks() });
  const data = query.data?.ok ? query.data : null;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['external-upload-links'] });

  const create = useMutation({
    mutationFn: () => createExternalUploadLink({ label, scope, days: Number(days) }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      setCreatedUrl(result.url);
      setLabel('');
      refresh();
    },
    onError: () => toast.error('No se pudo crear el link'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeExternalUploadLink(id),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      toast.success('Link revocado: ya no se puede usar');
      refresh();
    },
  });

  if (query.data && !query.data.ok) return null;
  const scopes = (['Persona', 'Equipos', 'Ambos'] as const).filter((s) =>
    s === 'Persona' ? data?.canPeople : s === 'Equipos' ? data?.canEquipment : data?.canPeople && data?.canEquipment
  );

  return (
    <section aria-labelledby="external-links" className="space-y-3">
      <h3 id="external-links" className="flex items-center gap-2 text-base font-semibold">
        <Link2 className="size-4" aria-hidden="true" />
        Links de carga externa
      </h3>
      <p className="text-muted-foreground text-sm">
        Para que un estudio contable o una consultora suba documentos sin ser usuario. Lo que suben queda acá, pendiente
        de validar.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor={labelId}>Para quién es</Label>
          <Input
            id={labelId}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Estudio contable Pérez"
          />
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">Puede cargar</span>
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="w-48" aria-label="Puede cargar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((s) => (
                <SelectItem key={s} value={s}>
                  {SCOPE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">Vence en</span>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32" aria-label="Vence en">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['7', '15', '30', '60', '90'].map((d) => (
                <SelectItem key={d} value={d}>
                  {d} días
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" disabled={create.isPending || label.trim().length < 3} onClick={() => create.mutate()}>
          {create.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Crear link
        </Button>
      </div>

      {createdUrl && (
        <div className="bg-ok-subtle text-ok-subtle-foreground space-y-2 rounded-md border p-3 text-sm" role="status">
          <p className="font-medium">Copialo ahora: por seguridad no se vuelve a mostrar completo.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-background text-foreground min-w-0 flex-1 truncate rounded px-2 py-1">
              {createdUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(createdUrl).then(() => toast.success('Link copiado'));
              }}
            >
              <Copy aria-hidden="true" />
              Copiar
            </Button>
          </div>
        </div>
      )}

      {query.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : data && data.links.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {data.links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 font-medium">{l.label}</span>
              <span className="text-muted-foreground">{SCOPE_LABEL[l.scope]}</span>
              <span className="text-muted-foreground tabular-nums">
                {l.uploads} {l.uploads === 1 ? 'carga' : 'cargas'} · vence {formatArgentinaDay(l.expiresAt)}
              </span>
              <Badge variant={STATE_UI[l.state].variant}>{STATE_UI[l.state].label}</Badge>
              {l.state === 'active' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(l.id)}
                >
                  Revocar
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Todavía no se creó ningún link.</p>
      )}
    </section>
  );
}
