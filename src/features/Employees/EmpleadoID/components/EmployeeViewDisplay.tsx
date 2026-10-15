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

/** Columnas `@db.Date`: llegan como medianoche UTC. */
const formatDate = (value: Date | string | null | undefined) => (value ? moment.utc(value).format('DD/MM/YYYY') : null);

interface EmployeeRecordDataProps {
  employee: Employee;
  /** `empleados:datos-personales` */
  showPersonal: boolean;
  /** `empleados:datos-contacto` (solo junto con los personales, como siempre). */
  showContact: boolean;
  /** `empleados:datos-laborales` */
  showWork: boolean;
}

/**
 * Legajo en lectura, agrupado por tema: identidad, contacto, puesto, encuadre y asignaciones.
 * Cada bloque respeta el permiso de su pestaña de origen.
 */
export function EmployeeRecordData({ employee, showPersonal, showContact, showWork }: EmployeeRecordDataProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {showPersonal && <IdentityBlock employee={employee} />}
      {showPersonal && showContact && <ContactBlock employee={employee} />}
      {showWork && (
        <>
          <PositionBlock employee={employee} />
          <FrameworkBlock employee={employee} />
          <AssignmentsBlock employee={employee} />
        </>
      )}
    </div>
  );
}

function IdentityBlock({ employee }: { employee: Employee }) {
  return (
    <SectionCard title="Identidad" description="Tal como figura en el documento.">
      <FieldGrid>
        <Field label="Apellido" value={employee.lastname} />
        <Field label="Nombre" value={employee.firstname} />
        <Field label="Tipo de documento" value={enumLabel(employee.document_type, documentTypeLabels)} />
        <Field label="Número de documento" value={employee.document_number} mono />
        <Field label="CUIL" value={employee.cuil} mono />
        <Field label="Fecha de nacimiento" value={formatDate(employee.born_date)} mono />
        <Field label="Sexo" value={enumLabel(employee.gender, genderLabels)} />
        <Field label="Nacionalidad" value={enumLabel(employee.nationality, nationalityLabels)} />
        <Field label="País de nacimiento" value={employee.countries?.name} />
        <Field label="Estado civil" value={enumLabel(employee.marital_status, maritalStatusLabels)} />
        <Field label="Nivel de instrucción" value={enumLabel(employee.level_of_education, levelOfEducationLabels)} />
      </FieldGrid>
    </SectionCard>
  );
}

function ContactBlock({ employee }: { employee: Employee }) {
  const address = [employee.street, employee.street_number].filter(Boolean).join(' ');

  return (
    <SectionCard title="Contacto y domicilio">
      <FieldGrid>
        <Field label="Teléfono" value={employee.phone} mono />
        <Field label="Email" value={employee.email} />
        <Field label="Dirección" value={address} />
        <Field label="Ciudad" value={employee.cities?.name} />
        <Field label="Provincia" value={employee.provinces?.name} />
        <Field label="Código postal" value={employee.postal_code} mono />
      </FieldGrid>
    </SectionCard>
  );
}

function PositionBlock({ employee }: { employee: Employee }) {
  return (
    <SectionCard title="Puesto y jornada">
      <FieldGrid>
        <Field label="Legajo" value={employee.file} mono />
        <Field label="Fecha de ingreso" value={formatDate(employee.date_of_admission)} mono />
        <Field label="Tipo de contrato" value={employee.types_of_contract?.name} />
        <Field label="Sector" value={employee.hierarchy?.name} />
        <Field label="Puesto" value={employee.company_positions?.name} />
        <Field label="Diagrama de trabajo" value={employee.work_diagram?.name} />
        <Field
          label="Horas normales"
          value={employee.normal_hours != null ? String(employee.normal_hours) : null}
          mono
        />
      </FieldGrid>
    </SectionCard>
  );
}

function FrameworkBlock({ employee }: { employee: Employee }) {
  return (
    <SectionCard title="Convenio y costos">
      <FieldGrid>
        <Field label="Gremio" value={employee.guild?.name} />
        <Field label="Convenio" value={employee.covenant?.name} />
        <Field label="Categoría" value={employee.category?.name} />
        <Field label="Centro de costo" value={employee.cost_center?.name} />
        <Field label="Tipo de costo" value={enumLabel(employee.cost_type, costTypeLabels)} />
      </FieldGrid>
    </SectionCard>
  );
}

function TagList({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <dt className="text-muted-foreground text-sm">
        {label} <span className="tabular-nums">({items.length})</span>
      </dt>
      <dd>
        {items.length === 0 ? (
          <span className="text-muted-foreground text-sm">{empty}</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <li key={item}>
                <Badge variant="secondary">{item}</Badge>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

function AssignmentsBlock({ employee }: { employee: Employee }) {
  const contractors = employee.contractor_employee
    .map((ce) => ce.customers?.name)
    .filter((name): name is string => !!name);
  const aptitudes = employee.empleado_aptitudes
    .map((ea) => ea.aptitudes_tecnicas?.nombre)
    .filter((name): name is string => !!name);
  const workshopSectors = (employee.employee_workshop_sectors ?? [])
    .map((ews) => ews.workshop_sectors?.name)
    .filter((name): name is string => !!name);

  return (
    <SectionCard title="Asignaciones">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-3">
        <TagList label="Clientes" items={contractors} empty="Sin afectar" />
        <TagList label="Aptitudes técnicas" items={aptitudes} empty="Sin aptitudes" />
        <TagList label="Sectores de taller" items={workshopSectors} empty="Sin sectores" />
      </dl>
    </SectionCard>
  );
}
