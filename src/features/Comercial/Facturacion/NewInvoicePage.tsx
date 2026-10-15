import { getFiscalDataOverview } from '@/features/Empresa/General/FiscalData/actions/fiscal-data.server';
import { joinList } from '@/features/Empresa/General/FiscalData/utils/format';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { ArrowLeft, CircleDashed, FilePlus2, FileSpreadsheet, Lock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getCustomersForManualInvoice, getInvoiceableCustomers } from './actions/invoices.server';
import { InvoiceEnvironmentNotice } from './components/InvoiceEnvironmentNotice';
import { CertificationsInvoiceForm } from './components/new/CertificationsInvoiceForm';
import { ManualInvoiceForm } from './components/new/ManualInvoiceForm';
import { FISCAL_DATA_HREF, INVOICING_TAB_HREF, NEW_INVOICE_HREF } from './utils/invoice-links';

export type NewInvoiceOrigin = 'certificaciones' | 'manual' | null;

const LINK_CLASS =
  'font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={INVOICING_TAB_HREF}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex w-fit items-center gap-1 text-sm outline-none focus-visible:ring-[3px]"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Facturación
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-balance">{title}</h1>
        <p className="text-muted-foreground text-sm text-pretty">{description}</p>
      </div>
    </div>
  );
}

function BlockingNotice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 border border-warn/35 bg-warn-subtle px-4 py-3 text-sm text-warn-subtle-foreground"
    >
      {icon}
      <div className="min-w-0 flex-1 text-pretty">{children}</div>
    </div>
  );
}

/**
 * `/dashboard/comercial/facturacion/nueva`: crear un borrador de factura.
 * - `?origen=certificaciones`: elegir cliente y sus certificaciones confirmadas.
 * - `?origen=manual`: elegir cliente y moneda; las líneas se cargan en el editor.
 * - Sin origen: elegir entre las dos.
 *
 * Los datos de cada origen se leen en el servidor, en paralelo con permisos y configuración fiscal.
 */
export async function NewInvoicePage({ origin }: { origin: NewInvoiceOrigin }) {
  const [permissions, overview, certificationCustomers, manualCustomers] = await Promise.all([
    getUserPermissionsMapServer(),
    getFiscalDataOverview(),
    origin === 'certificaciones' ? getInvoiceableCustomers() : Promise.resolve(null),
    origin === 'manual' ? getCustomersForManualInvoice() : Promise.resolve(null),
  ]);

  const canCreate = permissions['comercial:facturacion:create'] === true;
  const titles: Record<'certificaciones' | 'manual' | 'none', { title: string; description: string }> = {
    certificaciones: {
      title: 'Nueva factura desde certificaciones',
      description:
        'Elegí el cliente y las certificaciones confirmadas que van en la factura. Tienen que ser de la misma moneda.',
    },
    manual: {
      title: 'Nueva factura manual',
      description: 'Elegí el cliente y la moneda. Las líneas las cargás en el borrador.',
    },
    none: {
      title: 'Nueva factura',
      description: 'Elegí de dónde salen las líneas de la factura.',
    },
  };
  const header = titles[origin ?? 'none'];

  if (!canCreate) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-4">
        <PageHeader {...header} />
        <BlockingNotice icon={<Lock className="mt-0.5 size-4 shrink-0" aria-hidden />}>
          <p>Para crear facturas necesitás el permiso Crear en Facturación. Pedíselo a un administrador.</p>
        </BlockingNotice>
      </div>
    );
  }

  // Sin datos fiscales o sin punto de venta el servidor no deja crear el borrador: se avisa antes.
  const draftBlockers: string[] = [];
  if (!overview.readiness.profileComplete) draftBlockers.push('completar los datos fiscales de la empresa');
  if (overview.readiness.activeSalesPoints === 0) draftBlockers.push('cargar al menos un punto de venta');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-4">
      <PageHeader {...header} />

      <InvoiceEnvironmentNotice environment={overview.environment} simulated={overview.arcaSimulated} scope="draft" />

      {draftBlockers.length > 0 ? (
        <BlockingNotice icon={<CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />}>
          <p>
            Todavía no podés crear facturas: falta {joinList(draftBlockers)}.{' '}
            <Link href={FISCAL_DATA_HREF} className={LINK_CLASS}>
              Completar en Datos fiscales
            </Link>
          </p>
        </BlockingNotice>
      ) : origin === 'certificaciones' ? (
        <CertificationsInvoiceForm customers={certificationCustomers ?? []} />
      ) : origin === 'manual' ? (
        <ManualInvoiceForm customers={manualCustomers ?? []} />
      ) : (
        <OriginChooser />
      )}
    </div>
  );
}

function OriginChooser() {
  const options = [
    {
      href: `${NEW_INVOICE_HREF}?origen=certificaciones`,
      Icon: FileSpreadsheet,
      title: 'Desde certificaciones',
      text: 'Facturá certificaciones confirmadas de un cliente. Las cantidades y los precios salen de las certificaciones.',
    },
    {
      href: `${NEW_INVOICE_HREF}?origen=manual`,
      Icon: FilePlus2,
      title: 'Factura manual',
      text: 'Elegí el cliente y la moneda, y cargá las líneas a mano.',
    },
  ];
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {options.map(({ href, Icon, title, text }) => (
        <li key={href}>
          <Link
            href={href}
            className="hover:bg-accent focus-visible:ring-ring/50 flex h-full items-start gap-3 border p-5 outline-none transition-colors focus-visible:ring-[3px]"
          >
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{title}</span>
              <span className="text-muted-foreground text-sm text-pretty">{text}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
