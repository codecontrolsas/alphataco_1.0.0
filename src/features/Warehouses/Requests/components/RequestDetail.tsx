import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import moment from 'moment';
import Link from 'next/link';
import type { MaterialRequestDetail } from '../../actions/requests.server';
import { formatMoney, formatQuantity } from '../../lib/format';
import { DESTINATION_TYPE_LABELS } from '../../lib/labels';
import { RequestActions } from './RequestDecisionDialogs';
import { RequestStatusBadge } from './RequestStatusBadge';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const DECISION_TITLE: Record<string, string> = { REJECTED: 'Rechazado por' };

/** Detalle del pedido: cabecera, lineas con lo entregado y pendiente, y sus entregas. */
export function RequestDetail({ request }: { request: MaterialRequestDetail }) {
  const at = (iso: string) => moment(iso).format('DD/MM/YYYY HH:mm');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{request.number}</h1>
        <RequestStatusBadge status={request.status} />
        <div className="ml-auto">
          <RequestActions request={request} />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Pedido por">
              {request.requestedBy} · {at(request.createdAt)}
            </Field>
            <Field label={`Se imputa a (${DESTINATION_TYPE_LABELS[request.destinationType]})`}>{request.destination ?? '—'}</Field>
            {request.workOrder && <Field label="Orden de trabajo">{request.workOrder}</Field>}
            {request.decision && (
              <Field label={DECISION_TITLE[request.status] ?? 'Aprobado por'}>
                {request.decision.by} · {at(request.decision.at)}
              </Field>
            )}
            {request.estimatedTotal !== null && (
              <Field label="Total estimado (promedio vigente)">{formatMoney(request.estimatedTotal)}</Field>
            )}
            {request.notes && (
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label="Observaciones">
                  <span className="whitespace-pre-wrap">{request.notes}</span>
                </Field>
              </div>
            )}
            {request.decision?.notes && (
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label="Motivo del rechazo">
                  <span className="whitespace-pre-wrap">{request.decision.notes}</span>
                </Field>
              </div>
            )}
            {request.closing && (
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label={request.status === 'CANCELLED' ? 'Cancelado por' : 'Cerrado por'}>
                  {request.closing.by} · {at(request.closing.at)}
                  {request.closing.notes && <span className="block whitespace-pre-wrap">{request.closing.notes}</span>}
                </Field>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Materiales</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Pedido</TableHead>
                <TableHead className="text-right">Entregado</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {request.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Link href={`/dashboard/warehouse/materials/${line.material.id}`} className="hover:underline">
                      <span className="font-mono text-xs text-muted-foreground">{line.material.code}</span> {line.material.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(line.requested)} {line.material.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(line.delivered)} {line.material.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(line.pending) > 0 ? `${formatQuantity(line.pending)} ${line.material.unit}` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entregas</CardTitle>
        </CardHeader>
        <CardContent>
          {request.deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hubo entregas.</p>
          ) : (
            <ul className="divide-y">
              {request.deliveries.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Link href={`/dashboard/warehouse/movements/${d.id}`} className="font-mono underline">
                    {d.number}
                  </Link>
                  <span className="text-muted-foreground">
                    {moment(d.occurredOn).format('DD/MM/YYYY')} · {d.warehouse}
                  </span>
                  {d.isReversal && <Badge variant="outline">Anulación</Badge>}
                  {d.reversedBy && <Badge variant="destructive">Anulada por {d.reversedBy}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
