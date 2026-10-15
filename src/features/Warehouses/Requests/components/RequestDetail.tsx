import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PurchaseRequestStatusBadge } from '@/features/Purchases/Requests/components/PurchaseRequestStatusBadge';
import type { PurchaseRequestStatus } from '@/features/Purchases/lib/request-state-machine';
import { ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
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

/** Solicitudes de compra del pedido (Compras etapa 1) y si se puede generar una nueva. */
export interface RequestPurchases {
  items: { id: string; number: string; status: PurchaseRequestStatus }[];
  canCreate: boolean;
}

/** Estados en los que el pedido espera entregas: ahi tiene sentido comprar lo que falta. */
const AWAITING_DELIVERY = new Set(['APPROVED', 'PARTIALLY_DELIVERED']);

/**
 * Cuerpo del detalle (datos del pedido, materiales, entregas y compras). Lo comparten la pagina de detalle
 * y el panel lateral de la lista, que ponen su propia cabecera con el numero, el estado y las acciones.
 */
export function RequestDetailBody({ request, purchases }: { request: MaterialRequestDetail; purchases: RequestPurchases }) {
  const canGeneratePurchase = purchases.canCreate && AWAITING_DELIVERY.has(request.status);
  const at = formatArgentinaDateTime;

  return (
    <div className="space-y-4">
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
          <div className="overflow-x-auto">
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
          </div>
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
                    {formatDateAr(d.occurredOn)} · {d.warehouse}
                  </span>
                  {d.isReversal && <Badge variant="outline">Anulación</Badge>}
                  {d.reversedBy && <Badge variant="destructive">Anulada por {d.reversedBy}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(purchases.items.length > 0 || canGeneratePurchase) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Solicitudes de compra</CardTitle>
            {canGeneratePurchase && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/purchases/requests/new?fromMaterialRequest=${request.id}`}>
                  <ShoppingCart className="mr-1 h-4 w-4" />
                  Generar solicitud de compra
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {purchases.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Si falta stock para entregar, se puede pedir la compra de lo que falta.
              </p>
            ) : (
              <ul className="divide-y">
                {purchases.items.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <Link href={`/dashboard/purchases/requests/${p.id}`} className="font-mono underline">
                      {p.number}
                    </Link>
                    <PurchaseRequestStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Detalle del pedido en su propia pagina: cabecera con numero, estado y acciones + el cuerpo. */
export function RequestDetail({ request, purchases }: { request: MaterialRequestDetail; purchases: RequestPurchases }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{request.number}</h1>
        <RequestStatusBadge status={request.status} />
        <div className="ml-auto">
          <RequestActions request={request} />
        </div>
      </div>
      <RequestDetailBody request={request} purchases={purchases} />
    </div>
  );
}
