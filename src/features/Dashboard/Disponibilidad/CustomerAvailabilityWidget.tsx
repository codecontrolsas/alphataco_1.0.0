import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import {
  getVisibleFitKinds,
  loadCustomerAvailability,
  type AvailabilityCounts,
} from '@/features/Documentacion/CumplimientoClientes/lib/customer-compliance.server';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

const logger = new Logger('features/Dashboard/Disponibilidad');

const matrixHref = (customerId: string) =>
  `/dashboard/document?tab=cumplimiento-por-cliente&subtab=matriz&cliente=${customerId}`;
const plannerHref = (customerId: string) =>
  `/dashboard/document?tab=cumplimiento-por-cliente&subtab=simulador&cliente=${customerId}`;

function Num({ value, tone, label }: { value: number; tone: 'ok' | 'warn' | 'danger' | 'muted'; label: string }) {
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        value === 0 && 'text-muted-foreground',
        value > 0 && tone === 'ok' && 'text-ok-subtle-foreground font-semibold',
        value > 0 && tone === 'warn' && 'text-warn-subtle-foreground font-semibold',
        value > 0 && tone === 'danger' && 'text-danger-subtle-foreground font-semibold'
      )}
      aria-label={`${value} ${label}`}
    >
      {value}
    </span>
  );
}

function CountsCells({ counts, people }: { counts: AvailabilityCounts | null; people: boolean }) {
  if (!counts) return null;
  return (
    <>
      <td className="px-2 py-2 text-right">
        <Num value={counts.ok} tone="ok" label="cumplen" />
      </td>
      <td className="px-2 py-2 text-right">
        <Num value={counts.expiring} tone="warn" label="por vencer" />
      </td>
      <td className="px-2 py-2 text-right">
        <Num value={counts.blocked} tone="danger" label="no cumplen" />
      </td>
      {people && (
        <td className="px-2 py-2 text-right">
          <Num value={counts.offToday} tone="warn" label="con franco o licencia hoy" />
        </td>
      )}
    </>
  );
}

/**
 * Widget "Disponibilidad por cliente": por cada cliente, cuántas personas y equipos afectados se pueden asignar hoy
 * sin riesgo (cumplen la documentación que pide ese cliente), cuántos vencen en 30 días y cuántos no cumplen; para las
 * personas, además, cuántas aptas tienen hoy franco o licencia. Cada fila lleva a la matriz y al simulador del cliente.
 */
export async function CustomerAvailabilityWidget() {
  const [kinds, companyId, canViewPrincipal] = await Promise.all([
    getVisibleFitKinds(),
    getActiveCompanyId(),
    canViewDashboard('principal'),
  ]);

  if (kinds.length === 0 || !canViewPrincipal) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver esta información"
        description="Pedile a un administrador acceso a la documentación de personal o de equipos."
      />
    );
  }

  let data: Awaited<ReturnType<typeof loadCustomerAvailability>>;
  try {
    data = await loadCustomerAvailability(companyId, kinds);
  } catch (error) {
    logger.error('Error al calcular la disponibilidad por cliente', { data: { error } });
    return (
      <StateBlock
        variant="error"
        title="No se pudo calcular la disponibilidad"
        description="Probá recargar la página."
      />
    );
  }

  if (data.customers.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title="Ningún cliente tiene personas o equipos afectados"
        description="Afectalos desde Comercial → Clientes para ver a quién podés asignar a cada uno."
      />
    );
  }

  const showPeople = kinds.includes('Persona');
  const showEquipment = kinds.includes('Equipos');

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        «Por vencer»: cumple hoy, pero algo vence en los próximos 30 días. Tocá un cliente para ver el detalle.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">Personas y equipos asignables por cliente</caption>
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th scope="col" rowSpan={2} className="px-2 py-1 text-left align-bottom font-medium">
                Cliente
              </th>
              {showPeople && (
                <th scope="colgroup" colSpan={4} className="border-b px-2 py-1 text-center font-medium">
                  Personas
                </th>
              )}
              {showEquipment && (
                <th scope="colgroup" colSpan={3} className="border-b px-2 py-1 text-center font-medium">
                  Equipos
                </th>
              )}
              <th scope="col" rowSpan={2} className="px-2 py-1">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
            <tr className="text-muted-foreground text-xs">
              {showPeople && (
                <>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    Cumplen
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    Por vencer
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    No cumplen
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    Franco o licencia hoy
                  </th>
                </>
              )}
              {showEquipment && (
                <>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    Cumplen
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    Por vencer
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    No cumplen o no operativos
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data.customers.map((customer) => (
              <tr key={customer.id} className="border-t">
                <th scope="row" className="max-w-56 px-2 py-2 text-left font-medium">
                  <Link
                    href={matrixHref(customer.id)}
                    className="hover:underline focus-visible:ring-ring block truncate rounded outline-none focus-visible:ring-2"
                  >
                    {customer.name}
                  </Link>
                </th>
                {showPeople && <CountsCells counts={customer.people} people />}
                {showEquipment && <CountsCells counts={customer.equipment} people={false} />}
                <td className="px-2 py-2 text-right">
                  <Link
                    href={plannerHref(customer.id)}
                    className="text-brand-ink focus-visible:ring-ring inline-flex items-center gap-1 rounded text-xs whitespace-nowrap outline-none hover:underline focus-visible:ring-2"
                  >
                    Planificar
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                    <span className="sr-only"> recursos para {customer.name}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
