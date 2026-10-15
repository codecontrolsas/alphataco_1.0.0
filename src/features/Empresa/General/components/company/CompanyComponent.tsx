import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { PermissionGuardServer } from '@/features/Permissions';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { getActiveCompany } from '../../actions/company.server';

/** Ficha de la empresa activa: identidad arriba y datos agrupados por tema. */
export default async function CompanyComponent() {
  const company = await getActiveCompany();

  if (!company) {
    return (
      <StateBlock
        variant="error"
        title="No se pudieron cargar los datos de la empresa"
        description="Probá recargar la página."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <RecordHeader
        identity={
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-14 shrink-0">
              <AvatarImage
                src={company.company_logo ?? undefined}
                alt="Logo de la empresa"
                className="object-contain"
              />
              <AvatarFallback>
                <Building2 className="size-6" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{company.company_name}</h2>
              <p className="text-muted-foreground font-mono text-sm tabular-nums">CUIT {company.company_cuit || '—'}</p>
            </div>
          </div>
        }
        actions={
          <PermissionGuardServer module="configuracion" tab="general" action="update">
            <Link
              href={`/dashboard/configuration/companies/${company.id}`}
              className={buttonVariants({ variant: 'brand' })}
            >
              Editar
            </Link>
          </PermissionGuardServer>
        }
      />

      <div className="flex flex-col gap-4">
        <SectionCard title="Identificación">
          <FieldGrid>
            <Field label="Razón social" value={company.company_name} />
            <Field label="CUIT" value={company.company_cuit} mono />
            <Field label="Industria" value={company.industry} />
          </FieldGrid>
        </SectionCard>

        <SectionCard title="Contacto">
          <FieldGrid>
            <Field label="Email de contacto" value={company.contact_email} />
            <Field label="Teléfono de contacto" value={company.contact_phone} mono />
          </FieldGrid>
        </SectionCard>

        <SectionCard title="Ubicación">
          <FieldGrid>
            <Field label="Dirección" value={company.address} />
            <Field label="País" value={company.country} />
            <Field label="Provincia" value={company.provinces?.name} />
            <Field label="Ciudad" value={company.cities?.name} />
          </FieldGrid>
        </SectionCard>
      </div>
    </div>
  );
}
