import { CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CompanyForEdit } from '@/features/Empresa/General/actions/company.server';
import CityInput from '@/features/Empresa/General/components/CityInput';
import { SectionCard } from '@/shared/components/common/SectionCard';
import type { ReactNode } from 'react';

interface CatalogOption {
  id: number;
  name: string;
}

interface CompanyFormFieldsProps {
  provinces: CatalogOption[];
  industryTypes: CatalogOption[];
  /** Empresa a editar; ausente en el alta. */
  company?: CompanyForEdit | null;
}

/**
 * Campos del formulario de empresa, compartidos por el alta (`/dashboard/configuration/companies/new`) y la
 * edición (`/dashboard/configuration/companies/[id]`). Sólo pinta los inputs con sus `name`: el submit lo hace
 * el botón de cada pantalla (`CreateCompanyButton` / `EditCompanyButton`), que arma el `FormData`
 * y lo valida con `parseCompanyForm`.
 */
/** Campo con etiqueta y lugar para el error por campo (`<campo>_error`, lo pinta `showCompanyFieldErrors`). */
function FormField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <CardDescription id={`${id}_error`} />
    </div>
  );
}

export default function CompanyFormFields({ provinces, industryTypes, company }: CompanyFormFieldsProps) {
  return (
    <>
      <SectionCard title="Identificación">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="company_name" label="Nombre de la compañía">
            <Input
              defaultValue={company?.company_name}
              id="company_name"
              name="company_name"
              placeholder="nombre de la compañía"
            />
          </FormField>
          <FormField id="company_cuit" label="CUIT de la compañía">
            <Input
              defaultValue={company?.company_cuit}
              name="company_cuit"
              id="company_cuit"
              placeholder="CUIT de la compañía"
            />
          </FormField>
          <FormField id="industry" label="Seleccione una Industria">
            <Select defaultValue={company?.industry} name="industry">
              <SelectTrigger id="industry" name="industry" className="w-full">
                <SelectValue id="industry" placeholder="Seleccionar Industria" />
              </SelectTrigger>
              <SelectContent>
                {industryTypes.map((ind) => (
                  <SelectItem key={ind.id} value={ind.name}>
                    {ind.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="website" label="Sitio Web">
            <Input
              defaultValue={company?.website ?? ''}
              id="website"
              name="website"
              placeholder="sitio web de la compañía"
            />
          </FormField>
          <div className="md:col-span-2">
            <FormField id="description" label="Descripción">
              <Textarea
                defaultValue={company?.description}
                id="description"
                name="description"
                placeholder="Descripción de la compañía"
              />
            </FormField>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Checkbox id="by_defect" name="by_defect" />
            <Label htmlFor="by_defect">Marcar para seleccionar Compañia por defecto</Label>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Contacto">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="contact_email" label="Email">
            <Input
              defaultValue={company?.contact_email}
              id="contact_email"
              name="contact_email"
              placeholder="email de contacto"
            />
          </FormField>
          <FormField id="contact_phone" label="Número de teléfono">
            <Input
              defaultValue={company?.contact_phone}
              id="contact_phone"
              name="contact_phone"
              placeholder="teléfono de contacto"
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="Ubicación">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="address" label="Dirección">
            <Input defaultValue={company?.address} id="address" name="address" placeholder="dirección de la compañía" />
          </FormField>
          <FormField id="country" label="Seleccione un país">
            <Select defaultValue={company?.country} name="country">
              <SelectTrigger id="country" name="country" className="w-full">
                <SelectValue placeholder="Seleccionar país" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="argentina">Argentina</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <CityInput provinces={provinces} defaultProvince={company?.province} defaultCity={company?.city} />
        </div>
      </SectionCard>
    </>
  );
}
