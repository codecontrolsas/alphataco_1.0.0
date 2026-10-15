import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { DocumentVehicle } from '@/features/Documentacion/DetalleDocumento/actions/document-detail.server';
import { equipmentDisplayName, shortDate } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { DetailFacts } from './DetailFacts';

/** Sección "Equipo" de la ficha del documento. */
export function EquipmentInfoCard({ vehicle }: { vehicle: DocumentVehicle }) {
  return (
    <DetailFacts
      title="Equipo"
      description="Datos del equipo al que se le solicita el documento"
      lead={
        <div className="mb-5 flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage
              src={vehicle.picture ?? undefined}
              className="rounded-full object-cover"
              alt="Imagen del recurso"
            />
            <AvatarFallback>recurso</AvatarFallback>
          </Avatar>
          <p className="text-lg font-semibold">{equipmentDisplayName(vehicle)}</p>
        </div>
      }
      facts={[
        { label: 'Dominio', value: vehicle.domain },
        { label: 'Número interno', value: vehicle.intern_number },
        { label: 'Marca', value: vehicle.brand?.name },
        { label: 'Modelo', value: vehicle.model?.name },
        { label: 'Tipo de vehículo', value: vehicle.type_of_vehicle?.name },
        { label: 'Fecha de alta', value: shortDate(vehicle.created_at) },
        { label: 'Motor', value: vehicle.engine },
        { label: 'Chasis', value: vehicle.chassis },
      ]}
    />
  );
}
