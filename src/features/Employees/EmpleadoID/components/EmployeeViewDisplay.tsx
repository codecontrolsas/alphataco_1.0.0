import { Badge } from '@/components/ui/badge';
import { Field, FieldGrid, enumLabel } from '@/shared/components/common/FieldGrid';
import { SectionCard } from '@/shared/components/common/SectionCard';
import {
  costTypeLabels,
  documentTypeLabels,
  genderLabels,
  levelOfEducationLabels,
  maritalStatusLabels,
  nationalityLabels,
} from '@/shared/utils/mappers';
import moment from 'moment';
import type { EmployeeDetailData } from '../actions.server';

type Employee = NonNullable<EmployeeDetailData>;

const formatDate = (value: Date | string | null | undefined) => (value ? moment.utc(value).format('DD/MM/YYYY') : null);

/** Datos personales y, si el usuario puede verlos, los de contacto. */
export function PersonalDataView({ employee, showContact }: { employee: Employee; showContact: boolean }) {
  const address = [employee.street, employee.street_number].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <SectionCard title="Datos personales" description="Identidad del empleado.">
        <FieldGrid>
          <Field label="Nombre" value={employee.firstname} />
          <Field label="Apellido" value={employee.lastname} />
          <Field label="Tipo de documento" value={enumLabel(employee.document_type, documentTypeLabels)} />
          <Field label="Número de documento" value={employee.document_number} mono />
          <Field label="CUIL" value={employee.cuil} mono />
          <Field label="Fecha de nacimiento" value={formatDate(employee.born_date)} mono />
          <Field label="Nacionalidad" value={enumLabel(employee.nationality, nationalityLabels)} />
          <Field label="País de nacimiento" value={employee.countries?.name} />
          <Field label="Sexo" value={enumLabel(employee.gender, genderLabels)} />
          <Field label="Estado civil" value={enumLabel(employee.marital_status, maritalStatusLabels)} />
          <Field label="Nivel de instrucción" value={enumLabel(employee.level_of_education, levelOfEducationLabels)} />
        </FieldGrid>
      </SectionCard>

      {showContact && (
        <SectionCard title="Contacto y dirección" description="Domicilio y medios de contacto.">
          <FieldGrid>
            <Field label="Dirección" value={address} />
            <Field label="Provincia" value={employee.provinces?.name} />
            <Field label="Ciudad" value={employee.cities?.name} />
            <Field label="Código postal" value={employee.postal_code} mono />
            <Field label="Teléfono" value={employee.phone} mono />
            <Field label="Email" value={employee.email} />
          </FieldGrid>
        </SectionCard>
      )}
    </div>
  );
}

function TagList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} variant="secondary">
          {item}
        </Badge>
      ))}
    </div>
  );
}

export function WorkDataView({ employee }: { employee: Employee }) {
  const contractors = employee.contractor_employee
    .map((ce) => ce.customers?.name)
    .filter((name): name is string => !!name);
  const aptitudes = employee.empleado_aptitudes
    .map((ea) => ea.aptitudes_tecnicas?.nombre)
    .filter((name): name is string => !!name);
  const workshopSectors =
    employee.employee_workshop_sectors
      ?.map((ews) => ews.workshop_sectors?.name)
      .filter(Boolean)
      .join(', ') || null;

  return (
    <div className="space-y-6">
      <SectionCard title="Laboral" description="Puesto, régimen y encuadre.">
        <FieldGrid>
          <Field label="Legajo" value={employee.file} mono />
          <Field label="Sector" value={employee.hierarchy?.name} />
          <Field label="Puesto" value={employee.company_positions?.name} />
          <Field label="Diagrama de trabajo" value={employee.work_diagram?.name} />
          <Field
            label="Horas normales"
            value={employee.normal_hours != null ? String(employee.normal_hours) : null}
            mono
          />
          <Field label="Tipo de contrato" value={employee.types_of_contract?.name} />
          <Field label="Fecha de ingreso" value={formatDate(employee.date_of_admission)} mono />
          <Field label="Gremio" value={employee.guild?.name} />
          <Field label="Convenio" value={employee.covenant?.name} />
          <Field label="Categoría" value={employee.category?.name} />
          <Field label="Centro de costo" value={employee.cost_center?.name} />
          <Field label="Tipo de costo" value={enumLabel(employee.cost_type, costTypeLabels)} />
          <Field label="Sectores de taller" value={workshopSectors} />
        </FieldGrid>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Asignado a contratistas">
          <TagList items={contractors} empty="Sin asignar" />
        </SectionCard>
        <SectionCard title="Aptitudes técnicas">
          <TagList items={aptitudes} empty="Sin aptitudes" />
        </SectionCard>
      </div>
    </div>
  );
}
