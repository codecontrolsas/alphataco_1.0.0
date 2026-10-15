import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { DocumentEmployee } from '@/features/Documentacion/DetalleDocumento/actions/document-detail.server';
import {
  employeeAddress,
  employeeDisplayName,
  formatCuit,
  shortDate,
} from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { DetailFacts } from './DetailFacts';

/** Sección "Empleado" de la ficha del documento. */
export function EmployeeInfoCard({ employee }: { employee: DocumentEmployee }) {
  const affectations = employee.contractor_employee
    .map((link) => link.customers?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <DetailFacts
      title="Empleado"
      description="Datos del empleado al que se le solicita el documento"
      lead={
        <div className="mb-5 flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage
              src={employee.picture ?? undefined}
              className="rounded-full object-cover"
              alt="Imagen del recurso"
            />
            <AvatarFallback>recurso</AvatarFallback>
          </Avatar>
          <p className="text-lg font-semibold">
            <span className="text-muted-foreground mr-2 font-mono text-base">[{employee.file}]</span>
            {employeeDisplayName(employee)}
          </p>
        </div>
      }
      facts={[
        { label: 'Legajo', value: employee.file },
        { label: 'DNI', value: employee.document_number },
        { label: 'CUIL', value: formatCuit(employee.cuil) },
        { label: 'Dirección', value: employeeAddress(employee) },
        { label: 'Provincia', value: employee.province?.name },
        { label: 'Teléfono de contacto', value: employee.phone },
        { label: 'Email de contacto', value: employee.email },
        { label: 'Fecha de alta', value: shortDate(employee.created_at) },
        {
          label: 'Afectaciones',
          wide: true,
          value: affectations.length ? (
            <ul className="list-inside list-disc">
              {affectations.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : null,
        },
      ]}
    />
  );
}
