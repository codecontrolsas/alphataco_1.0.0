'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Sparkles, Trash2 } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  autoReconcileAccount,
  debitCheckFromLine,
  deleteStatement,
  getReconciliationData,
  ignoreLine,
  matchLine,
  unmatchLine,
  type ReconciliationData,
} from '../../actions/reconciliation.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';
import { formatInCurrency } from '../../lib/currency-format';
import { invalidateTreasury } from '../../lib/invalidate';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { formatArgentinaDateTime } from '../../lib/today';
import { BANK_LINE_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';
import { TREASURY_MOVEMENT_KIND_LABELS } from '../../schemas/movements';
import { ImportStatementDialog } from './ImportStatementDialog';
import { RegisterLineDialog } from './RegisterLineDialog';
import { formatDay } from '../../lib/dates';

const logger = new Logger('Treasury/ReconciliationView');

const tone = (amount: string) => (amount.startsWith('-') ? 'text-danger' : '');

function LineStatusIcon({ status }: { status: keyof typeof BANK_LINE_STATUS_UI }) {
  const Icon = BANK_LINE_STATUS_UI[status].icon;
  return <Icon className="h-3 w-3" aria-hidden="true" />;
}

type Line = ReconciliationData['lines'][number];
type Can = { import: boolean; update: boolean; delete: boolean; debitChecks: boolean };

type Dialog = { kind: 'register'; line: Line } | { kind: 'ignore'; line: Line } | { kind: 'unmatch'; line: Line } | { kind: 'delete-statement'; id: string; fileName: string } | null;

/**
 * Conciliación de una cuenta bancaria (spec Tesorería etapa 4 §4.2): importaciones, resumen, las
 * líneas del extracto con sus sugerencias y acciones, y los movimientos del libro sin conciliar.
 * Elegir una línea y un movimiento del mismo importe habilita "Conciliar".
 */
export function ReconciliationView({
  accounts,
  accountId,
  initialData,
  can,
}: {
  accounts: { id: string; name: string; is_active: boolean }[];
  accountId: string;
  initialData: ReconciliationData;
  can: Can;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const showAllId = useId();
  const [showAll, setShowAll] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.reconciliation, accountId, showAll],
    queryFn: () => getReconciliationData(accountId, { showAll }),
    initialData: showAll ? undefined : initialData,
    staleTime: 0,
  });
  const current = data ?? initialData;
  const line = current.lines.find((l) => l.id === selectedLine) ?? null;
  const movement = current.bookMovements.find((m) => m.id === selectedMovement) ?? null;
  const suggested = new Set(line ? (current.suggestions[line.id]?.movements ?? []) : []);

  const run = useMutation({
    mutationFn: async (input: { action: () => Promise<ActionResult<unknown>>; success: string | ((data: unknown) => string) }) => {
      const data = unwrapAction(await input.action());
      return typeof input.success === 'function' ? input.success(data) : input.success;
    },
    onSuccess: (message) => {
      toast.success(message);
      setSelectedLine(null);
      setSelectedMovement(null);
      invalidateTreasury(queryClient);
    },
    onError: (error) => {
      logger.error('Error en la conciliación', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción');
    },
  });

  const auto = () =>
    run.mutate({
      action: () => autoReconcileAccount(accountId),
      success: (data) => {
        const matched = (data as { matched: number }).matched;
        return matched === 0 ? 'No hay coincidencias únicas para conciliar' : `${matched} ${matched === 1 ? 'línea conciliada' : 'líneas conciliadas'}`;
      },
    });

  const s = current.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label>Cuenta bancaria</Label>
          <Select value={accountId} onValueChange={(id) => router.replace(`/dashboard/treasury?tab=conciliacion&cuenta=${id}`)}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  {a.is_active ? '' : ' (inactiva)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {can.update && (
            <Button type="button" size="sm" variant="outline" onClick={auto} disabled={run.isPending}>
              <Sparkles className="mr-1 h-4 w-4" />
              Conciliar automáticamente
            </Button>
          )}
          {can.import && <ImportStatementDialog key={accountId} account={current.account} profile={current.profile} />}
        </div>
      </div>

      {isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-danger/40 bg-danger-subtle p-3 text-sm text-danger-subtle-foreground">
          No se pudo actualizar la conciliación: se muestran los últimos datos cargados.
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            Reintentar
          </Button>
        </div>
      )}
      {showAll && isFetching && !data && (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando todas las líneas…
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: `Saldo del libro al ${formatDay(s.to)}`, value: s.bookBalance },
          { label: 'Extracto pendiente: créditos', value: s.pendingCredits },
          { label: 'Extracto pendiente: débitos', value: s.pendingDebits },
          { label: 'Libro sin conciliar (ingresos / egresos)', value: `${s.unreconciledIn}|${s.unreconciledOut}` },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              {k.value.includes('|') ? (
                <p className="text-lg font-semibold tabular-nums">
                  {formatInCurrency(k.value.split('|')[0]!, 'ARS')} / <span className="text-danger">{formatInCurrency(k.value.split('|')[1]!, 'ARS')}</span>
                </p>
              ) : (
                <p className={`text-lg font-semibold tabular-nums ${tone(k.value)}`}>{formatInCurrency(k.value, 'ARS')}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Extracto del banco</CardTitle>
              <CardDescription>Elegí una línea para ver sus movimientos sugeridos.</CardDescription>
              {current.totalLines > current.lines.length && (
                <p role="status" className="text-xs tabular-nums text-warn-subtle-foreground">
                  Mostrando {current.lines.length} de {current.totalLines} líneas{showAll ? ' (las más nuevas)' : ' (las más viejas primero)'}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch id={showAllId} checked={showAll} onCheckedChange={setShowAll} />
              <Label htmlFor={showAllId} className="text-sm font-normal">
                Ver todas
              </Label>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {current.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{showAll ? 'No hay líneas importadas.' : 'No hay líneas pendientes de conciliar.'}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.lines.map((l) => {
                    const sug = current.suggestions[l.id];
                    const selected = l.id === selectedLine;
                    return (
                      <TableRow key={l.id} className={selected ? 'bg-muted' : undefined}>
                        <TableCell className="whitespace-nowrap tabular-nums">{formatDay(l.date)}</TableCell>
                        <TableCell>
                          <span className="block">{l.description || '—'}</span>
                          {l.reference && <span className="block text-xs text-muted-foreground">Ref. {l.reference}</span>}
                          {l.status !== 'PENDING' && (
                            <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                              <Badge variant={TONE_TO_BADGE[BANK_LINE_STATUS_UI[l.status].tone]} className="gap-1">
                                <LineStatusIcon status={l.status} />
                                {BANK_LINE_STATUS_UI[l.status].label}
                              </Badge>
                              {l.movement ? `${TREASURY_MOVEMENT_KIND_LABELS[l.movement.kind]} del ${formatDay(l.movement.date)}` : ''}
                              {l.ignoreReason ? ` · ${l.ignoreReason}` : ''}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={`whitespace-nowrap text-right tabular-nums ${tone(l.amount)}`}>{formatInCurrency(l.amount, 'ARS')}</TableCell>
                        <TableCell className="text-right">
                          {l.status === 'PENDING' ? (
                            <div className="flex flex-wrap justify-end gap-1">
                              {can.update && (
                                <Button type="button" size="sm" variant={selected ? 'default' : 'outline'} onClick={() => setSelectedLine(selected ? null : l.id)}>
                                  {selected ? 'Elegida' : 'Elegir'}
                                  {sug && sug.movements.length > 0 ? ` (${sug.movements.length})` : ''}
                                </Button>
                              )}
                              {can.update &&
                                can.debitChecks &&
                                sug?.checks.map((c) => (
                                  <Button
                                    key={c.id}
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={run.isPending}
                                    title={c.supplier ?? undefined}
                                    onClick={() => run.mutate({ action: () => debitCheckFromLine({ lineId: l.id, checkId: c.id }), success: `Débito del cheque Nº ${c.number} confirmado y conciliado` })}
                                  >
                                    Débito del cheque Nº {c.number}
                                  </Button>
                                ))}
                              {can.update && (
                                <>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'register', line: l })}>
                                    Registrar
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'ignore', line: l })}>
                                    Ignorar
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : (
                            can.delete && (
                              <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'unmatch', line: l })}>
                                {l.status === 'IGNORED' ? 'Volver a pendiente' : 'Desconciliar'}
                              </Button>
                            )
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Libro sin conciliar</CardTitle>
              <CardDescription>Movimientos vigentes de la cuenta en el período del extracto (±5 días).</CardDescription>
              {current.totalBookMovements > current.bookMovements.length && (
                <p role="status" className="text-xs tabular-nums text-warn-subtle-foreground">
                  Mostrando {current.bookMovements.length} de {current.totalBookMovements} movimientos
                </p>
              )}
            </div>
            {can.update && (
              <Button
                type="button"
                size="sm"
                disabled={!line || !movement || line.amount !== movement.amount || run.isPending}
                title={line && movement && line.amount !== movement.amount ? 'El importe no coincide' : undefined}
                onClick={() => line && movement && run.mutate({ action: () => matchLine({ lineId: line.id, movementId: movement.id }), success: 'Línea conciliada' })}
              >
                <Link2 className="mr-1 h-4 w-4" />
                Conciliar
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {current.bookMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay movimientos sin conciliar en el período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Fecha</TableHead>
                    <TableHead>Movimiento</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.bookMovements.map((m) => (
                    <TableRow key={m.id} className={m.id === selectedMovement ? 'bg-muted' : suggested.has(m.id) ? 'bg-ok-subtle' : undefined}>
                      <TableCell>
                        <input
                          type="radio"
                          name="book-movement"
                          aria-label={`Elegir el movimiento del ${formatDay(m.date)}`}
                          checked={m.id === selectedMovement}
                          disabled={!can.update}
                          onChange={() => setSelectedMovement(m.id)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDay(m.date)}</TableCell>
                      <TableCell>
                        <span className="block text-xs text-muted-foreground">{TREASURY_MOVEMENT_KIND_LABELS[m.kind]}</span>
                        {m.description || '—'}
                        {suggested.has(m.id) && (
                          <Badge variant="outline" className="ml-2 border-ok text-ok-subtle-foreground">
                            Sugerido
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap text-right tabular-nums ${tone(m.amount)}`}>{formatInCurrency(m.amount, 'ARS')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importaciones</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {current.statements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se importó ningún extracto de esta cuenta.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Importado</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Líneas</TableHead>
                  <TableHead className="text-right">Pendientes</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {current.statements.map((st) => (
                  <TableRow key={st.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatArgentinaDateTime(st.createdAt)}</TableCell>
                    <TableCell>{st.fileName}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDay(st.dateFrom)} al {formatDay(st.dateTo)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {st.lineCount}
                      {st.skippedCount > 0 && <span className="text-xs text-muted-foreground"> (+{st.skippedCount} repetidas)</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{st.pending}</TableCell>
                    <TableCell>{st.creator ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {can.delete && st.used === 0 && (
                        <Button type="button" size="icon" variant="ghost" aria-label={`Borrar la importación ${st.fileName}`} onClick={() => setDialog({ kind: 'delete-statement', id: st.id, fileName: st.fileName })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialog?.kind === 'register' && <RegisterLineDialog open onOpenChange={(open) => !open && setDialog(null)} line={dialog.line} />}
      {dialog?.kind === 'ignore' && (
        <CancelReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title="Ignorar la línea"
          description={`${formatDay(dialog.line.date)} · ${dialog.line.description} · ${formatInCurrency(dialog.line.amount, 'ARS')}. Queda fuera de la conciliación; se puede volver a pendiente.`}
          successMessage="Línea ignorada"
          confirmLabel="Ignorar"
          run={(reason) => ignoreLine({ lineId: dialog.line.id, reason })}
        />
      )}
      {dialog?.kind === 'unmatch' && (
        <CancelReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={dialog.line.status === 'IGNORED' ? 'Volver a pendiente' : 'Desconciliar la línea'}
          description={
            dialog.line.status === 'CREATED'
              ? 'La línea vuelve a pendiente y se anula el movimiento que se creó desde ella.'
              : 'La línea vuelve a pendiente; el movimiento del libro queda sin conciliar.'
          }
          successMessage="Línea pendiente otra vez"
          confirmLabel={dialog.line.status === 'IGNORED' ? 'Volver a pendiente' : 'Desconciliar'}
          run={(reason) => unmatchLine(dialog.line.id, reason)}
        />
      )}
      {dialog?.kind === 'delete-statement' && (
        <CancelReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={`Borrar la importación ${dialog.fileName}`}
          description="Se borran todas sus líneas (ninguna está conciliada). Se puede volver a importar el archivo."
          successMessage="Importación borrada"
          confirmLabel="Borrar"
          run={() => deleteStatement(dialog.id)}
        />
      )}
    </div>
  );
}
