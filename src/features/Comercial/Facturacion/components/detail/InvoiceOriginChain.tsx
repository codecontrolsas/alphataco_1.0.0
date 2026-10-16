import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { CalendarDays, ClipboardList, FileCheck2, Receipt, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { loadInvoiceOrigin, type InvoiceOrigin } from '../../lib/invoice-origin.server';
import { CERTIFICATIONS_TAB_HREF } from '../../utils/invoice-links';

const logger = new Logger('features/Comercial/Facturacion/InvoiceOriginChain');

const LINK_CLASS =
  'font-medium tabular-nums underline underline-offset-4 outline-none hover:text-brand-ink focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded-sm';

const day = (value: string) => moment.utc(value).format('DD/MM/YYYY');

/** Qué eslabones puede abrir el usuario (se resuelve con sus permisos por módulo, en la página). */
export interface InvoiceOriginAccess {
  /** `operaciones:preparte:view` */
  orders: boolean;
  /** `operaciones:detalle-parte-diario:view` */
  reports: boolean;
  /** `comercial:certificaciones:view` */
  certifications: boolean;
}

interface Props {
  voucherLabel: string;
  certifications: { id: string; number: string; released: boolean }[];
  access: InvoiceOriginAccess;
}

/** Lista del planificador filtrada por número de pedido (el planificador no tiene ficha propia del pedido). */
const orderHref = (number: string) =>
  `/dashboard/operations?tab=preparte&preparte-table__search=${encodeURIComponent(number)}`;
const reportHref = (id: string) => `/dashboard/operations/${id}`;
const certificationHref = (number: string) =>
  `${CERTIFICATIONS_TAB_HREF}&certifications__search=${encodeURIComponent(number)}`;

function Step({
  icon: Icon,
  label,
  current = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      aria-current={current ? 'step' : undefined}
      className="border-border flex min-w-0 flex-col gap-1 border-s-2 ps-3 text-sm md:border-s-0 md:border-t-2 md:ps-0 md:pt-3"
    >
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </span>
      {children}
    </li>
  );
}

function Item({ href, children }: { href: string | null; children: ReactNode }) {
  return href ? (
    <Link href={href} className={LINK_CLASS}>
      {children}
    </Link>
  ) : (
    <span className="font-medium tabular-nums">{children}</span>
  );
}

function OrdersStep({ origin, access }: { origin: InvoiceOrigin; access: InvoiceOriginAccess }) {
  if (origin.orders.length === 0) {
    return (
      <p className="text-muted-foreground text-pretty">
        {origin.reports.count > 0 ? 'Sin pedido: los partes se cargaron directamente.' : 'Sin pedido de origen.'}
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {origin.orders.map((number) => (
        <li key={number}>
          <Item href={access.orders ? orderHref(number) : null}>{number}</Item>
        </li>
      ))}
    </ul>
  );
}

function ReportsStep({ origin, access }: { origin: InvoiceOrigin; access: InvoiceOriginAccess }) {
  const { count, first, last } = origin.reports;
  if (!first || !last) {
    return <p className="text-muted-foreground text-pretty">Las líneas no conservan su parte de origen.</p>;
  }
  const missing = origin.lines.total - origin.lines.withReport;
  return (
    <>
      <p className="tabular-nums">
        <span className="font-medium">{count === 1 ? '1 parte diario' : `${count} partes diarios`}</span>
      </p>
      <p className="text-muted-foreground tabular-nums">
        {count === 1 ? (
          <Item href={access.reports ? reportHref(first.id) : null}>{day(first.date)}</Item>
        ) : (
          <>
            del <Item href={access.reports ? reportHref(first.id) : null}>{day(first.date)}</Item> al{' '}
            <Item href={access.reports ? reportHref(last.id) : null}>{day(last.date)}</Item>
          </>
        )}
      </p>
      {missing > 0 && (
        <p className="text-muted-foreground text-pretty">
          {missing === 1 ? '1 línea ya no tiene' : `${missing} líneas ya no tienen`} su parte de origen.
        </p>
      )}
    </>
  );
}

/**
 * Trazabilidad "Pedido -> partes diarios -> certificación -> factura" del comprobante. Server Component
 * propio dentro de un `Suspense`: su consulta no frena el resto del detalle. Los eslabones que el usuario
 * no puede abrir se muestran como texto. Un comprobante sin certificaciones (manual o nota de ajuste)
 * muestra solo el último eslabón y lo aclara.
 */
export async function InvoiceOriginChain({ voucherLabel, certifications, access }: Props) {
  let origin: InvoiceOrigin;
  try {
    const companyId = await getActiveCompanyId();
    origin = await loadInvoiceOrigin(
      certifications.map((c) => c.id),
      companyId
    );
  } catch (error) {
    logger.error('No se pudo armar la cadena de origen del comprobante', { data: { error } });
    return (
      <section aria-labelledby="invoice-origin" className="rounded-xl border">
        <h2 id="invoice-origin" className="sr-only">
          Origen del comprobante
        </h2>
        <StateBlock
          variant="error"
          title="No se pudo cargar el origen del comprobante"
          description="Recargá la página para volver a intentarlo."
          className="py-6"
        />
      </section>
    );
  }

  const hasCertifications = certifications.length > 0;

  return (
    <section aria-labelledby="invoice-origin" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="invoice-origin" className="text-lg font-semibold">
        Origen del comprobante
      </h2>
      {!hasCertifications && (
        <p className="text-muted-foreground text-sm text-pretty">
          Este comprobante no se armó desde una certificación (carga manual o nota de ajuste): no hay pedido ni partes
          de origen.
        </p>
      )}
      <ol
        aria-label="Cadena de origen: pedido, partes diarios, certificación y factura"
        className="grid grid-cols-1 gap-4 md:grid-cols-4"
      >
        {hasCertifications && (
          <>
            <Step icon={ClipboardList} label="Pedido">
              <OrdersStep origin={origin} access={access} />
            </Step>
            <Step icon={CalendarDays} label="Partes diarios">
              <ReportsStep origin={origin} access={access} />
            </Step>
            <Step icon={FileCheck2} label={certifications.length === 1 ? 'Certificación' : 'Certificaciones'}>
              <ul className="flex flex-col gap-1">
                {certifications.map((cert) => (
                  <li key={cert.id} className="flex flex-col">
                    <Item href={access.certifications ? certificationHref(cert.number) : null}>{cert.number}</Item>
                    {cert.released && <span className="text-muted-foreground">liberada por nota de crédito</span>}
                  </li>
                ))}
              </ul>
            </Step>
          </>
        )}
        <Step icon={Receipt} label="Factura" current>
          <span className="font-semibold tabular-nums">{voucherLabel}</span>
          <span className="text-muted-foreground">Este comprobante</span>
        </Step>
      </ol>
    </section>
  );
}
