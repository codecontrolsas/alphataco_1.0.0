import { Field, FieldGrid, enumLabel } from '@/shared/components/common/FieldGrid';
import { SectionCard } from '@/shared/components/common/SectionCard';
import {
  documentTypeLabels,
  genderLabels,
  levelOfEducationLabels,
  maritalStatusLabels,
  nationalityLabels,
} from '@/shared/utils/mappers';
import moment from 'moment';
import type { PreEmployeeDetailData } from '../../actions/pre-employee-actions.server';

/** `born_date` se guarda como texto `YYYY-MM-DD`: se muestra como `DD/MM/YYYY` si tiene ese formato. */
const formatBornDate = (value: string | null) => {
  const parsed = value ? moment(value, 'YYYY-MM-DD', true) : null;
  return parsed?.isValid() ? parsed.format('DD/MM/YYYY') : value;
};

/** Datos del candidato en solo lectura, en tarjetas por tema. */
export function PreEmployeeDataView({ preEmployee }: { preEmployee: PreEmployeeDetailData }) {
  const address = [preEmployee.street, preEmployee.street_number].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <SectionCard title="Datos personales" description="Identidad del postulante.">
        <FieldGrid>
          <Field label="Nombre" value={preEmployee.firstname} />
          <Field label="Apellido" value={preEmployee.lastname} />
          <Field label="Tipo de documento" value={enumLabel(preEmployee.document_type, documentTypeLabels)} />
          <Field label="Número de documento" value={preEmployee.document_number} mono />
          <Field label="CUIL" value={preEmployee.cuil} mono />
          <Field label="Fecha de nacimiento" value={formatBornDate(preEmployee.born_date)} mono />
          <Field label="Nacionalidad" value={enumLabel(preEmployee.nationality, nationalityLabels)} />
          <Field label="País de nacimiento" value={preEmployee.countries?.name} />
          <Field label="Sexo" value={enumLabel(preEmployee.gender, genderLabels)} />
          <Field label="Estado civil" value={enumLabel(preEmployee.marital_status, maritalStatusLabels)} />
          <Field
            label="Nivel de instrucción"
            value={enumLabel(preEmployee.level_of_education, levelOfEducationLabels)}
          />
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Contacto y dirección" description="Domicilio y medios de contacto.">
        <FieldGrid>
          <Field label="Email" value={preEmployee.email} />
          <Field label="Teléfono" value={preEmployee.phone} mono />
          <Field label="Dirección" value={address} />
          <Field label="Provincia" value={preEmployee.provinces?.name} />
          <Field label="Ciudad" value={preEmployee.cities?.name} />
          <Field label="Código postal" value={preEmployee.postal_code} mono />
        </FieldGrid>
      </SectionCard>

      <SectionCard
        title="Función propuesta"
        description="Lo propone RR. HH. Al aprobar, gerencia completa el resto de los datos laborales."
      >
        <FieldGrid>
          <Field label="Sector" value={preEmployee.hierarchy?.name} />
          <Field label="Puesto" value={preEmployee.company_positions?.name} />
          <Field label="Pre legajo" value={preEmployee.pre_file_number} mono />
        </FieldGrid>
      </SectionCard>
    </div>
  );
}
