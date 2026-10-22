import { Separator } from '@/components/ui/separator';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getProvinces } from '@/shared/actions/countries.server';
import { Info, MonitorPlay } from 'lucide-react';
import { ArcaCertificateSection } from './components/ArcaCertificateSection';
import { FiscalEnvironmentSection } from './components/FiscalEnvironmentSection';
import { FiscalReadinessSummary } from './components/FiscalReadinessSummary';
import { IssuerFiscalForm } from './components/IssuerFiscalForm';
import { SalesPointsSection } from './components/SalesPointsSection';
import { getFiscalDataOverview } from './lib/fiscal-data-overview.server';
import { ARCA_ENVIRONMENTS } from './schemas/fiscal-data';

type ArcaEnvironment = (typeof ARCA_ENVIRONMENTS)[number];

function isArcaEnvironment(value: unknown): value is ArcaEnvironment {
  return typeof value === 'string' && (ARCA_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Configuración → General → Datos fiscales. Una sola lectura (`getFiscalDataOverview`) alimenta
 * todas las secciones; los componentes de cliente solo manejan la interacción y, tras mutar,
 * hacen `router.refresh()` para que este Server Component vuelva a leer.
 */
export default async function FiscalDataTabContent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const [overview, provinces, canUpdate] = await Promise.all([
    getFiscalDataOverview(),
    getProvinces(),
    checkPermissionServer('configuracion', 'datos-fiscales', 'update'),
  ]);

  // Solo lo que el form usa: el catálogo cruza el límite server → client.
  const provinceOptions = provinces.map((p) => ({ id: String(p.id), name: p.name }));
  const initialCertEnvironment = isArcaEnvironment(searchParams.cert) ? searchParams.cert : overview.environment;
  // Un único "ahora" para server y cliente: los días al vencimiento no cambian entre SSR e hidratación.
  const nowIso = new Date().toISOString();

  return (
    <div className="flex flex-col gap-8">
      {overview.arcaSimulated && (
        <div role="note" className="flex items-start gap-3 border px-4 py-3 text-sm">
          <MonitorPlay className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-pretty">
            ARCA simulado (modo demo): no hace falta certificado; los comprobantes no se informan a ARCA y no tienen
            validez fiscal.
          </p>
        </div>
      )}

      {!canUpdate && (
        <div role="note" className="text-muted-foreground flex items-start gap-3 border px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Para modificar los datos fiscales necesitás el permiso Modificar en Datos fiscales.</p>
        </div>
      )}

      <FiscalReadinessSummary overview={overview} nowIso={nowIso} />

      <FiscalEnvironmentSection
        environment={overview.environment}
        environmentChangedAt={overview.environmentChangedAt}
        productionBlockers={overview.productionBlockers}
        companyCuit={overview.company.cuit}
        canUpdate={canUpdate}
      />

      <Separator />

      <IssuerFiscalForm
        company={overview.company}
        profile={overview.profile}
        provinces={provinceOptions}
        canUpdate={canUpdate}
      />

      <Separator />

      <SalesPointsSection salesPoints={overview.salesPoints} canUpdate={canUpdate} />

      <Separator />

      <ArcaCertificateSection
        company={overview.company}
        activeEnvironment={overview.environment}
        initialEnvironment={initialCertEnvironment}
        certificates={overview.certificates}
        secretsKeyConfigured={overview.secretsKeyConfigured}
        arcaSimulated={overview.arcaSimulated}
        canUpdate={canUpdate}
        nowIso={nowIso}
      />
    </div>
  );
}
