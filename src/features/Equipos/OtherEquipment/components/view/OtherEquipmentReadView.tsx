import type { OtherEquipmentDetail } from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { OtherEquipmentMaintenanceTable } from '@/features/Equipos/OtherEquipment/maintenance/OtherEquipmentMaintenanceTable';
import { EquipmentBreadcrumb } from '@/features/Equipos/components/EquipmentBreadcrumb';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import type { RecordSectionDefinition } from '@/features/TabsManager/RecordSectionsServer';
import { RecordSectionsServer } from '@/features/TabsManager/RecordSectionsServer';
import { FileText, Package, QrCode, Wrench } from 'lucide-react';
import { OtherEquipmentHeader } from '../OtherEquipmentHeader';
import { OtherEquipmentQr } from '../OtherEquipmentQr';
import { OtherEquipmentAssignmentView, OtherEquipmentBasicDataView } from './OtherEquipmentDataView';

interface OtherEquipmentReadViewProps {
  equipment: OtherEquipmentDetail;
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
  certificationsComponent: React.ReactNode;
  qrComponent?: React.ReactNode;
}

/**
 * Ficha del equipamiento en lectura: ruta de vuelta al listado, cabecera con acciones e índice de
 * secciones (`?tab=`) a la izquierda. Solo se arma la sección activa.
 *
 * `aliases`: los valores de `?tab=` de la ficha anterior (`basicData`, `assignmentData`) caen en "Equipo";
 * `certifications`, `maintenance` y `qr` se conservan.
 */
export function OtherEquipmentReadView({
  equipment,
  searchParams,
  permissions,
  certificationsComponent,
  qrComponent,
}: OtherEquipmentReadViewProps) {
  const isTabVisible = createTabVisibilityChecker(permissions);
  const equipmentLabel = equipment.serial_number || equipment.intern_number || equipment.id;

  const sections: RecordSectionDefinition<'equipos' | 'mantenimiento'>[] = [
    {
      value: 'equipo',
      aliases: ['basicData', 'assignmentData'],
      label: 'Equipo',
      description: 'Identificación, contrato y asignación',
      icon: <Package aria-hidden="true" />,
      visibleWhenAny: [
        { moduleSlug: 'equipos', tabSlug: 'datos-basicos-otro' },
        { moduleSlug: 'equipos', tabSlug: 'asignacion-otro' },
      ],
      content: (
        <div className="space-y-6">
          {isTabVisible('equipos', 'datos-basicos-otro') && <OtherEquipmentBasicDataView equipment={equipment} />}
          {isTabVisible('equipos', 'asignacion-otro') && <OtherEquipmentAssignmentView equipment={equipment} />}
        </div>
      ),
    },
    {
      value: 'certifications',
      label: 'Documentos',
      description: 'Certificaciones y archivos',
      icon: <FileText aria-hidden="true" />,
      moduleSlug: 'equipos',
      tabSlug: 'certificaciones-otro',
      content: certificationsComponent,
    },
    {
      // Ticket 596: los equipamientos entran al circuito de mantenimiento.
      // Hereda los permisos del historial de mantenimiento de vehículos.
      value: 'maintenance',
      label: 'Mantenimiento',
      description: 'Órdenes del equipo',
      icon: <Wrench aria-hidden="true" />,
      moduleSlug: 'mantenimiento',
      tabSlug: 'ordenes_mantenimiento',
      content: <OtherEquipmentMaintenanceTable equipmentId={equipment.id} />,
    },
  ];

  // El código QR solo existe para los tipos que lo generan
  if (equipment.type?.generates_qr) {
    sections.push({
      value: 'qr',
      label: 'Código QR',
      description: 'Identificación del equipo',
      icon: <QrCode aria-hidden="true" />,
      moduleSlug: 'equipos',
      tabSlug: 'qr-otro-equipo',
      content: qrComponent ?? <OtherEquipmentQr equipmentId={equipment.id} equipmentLabel={equipmentLabel} />,
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <EquipmentBreadcrumb kind="other" isActive={equipment.is_active ?? true} identifier={equipmentLabel} />

      <OtherEquipmentHeader equipment={equipment} />

      <RecordSectionsServer<'equipos' | 'mantenimiento'>
        paramName="tab"
        searchParams={searchParams}
        permissions={permissions}
        defaultSection="equipo"
        preserveParams={['action', 'id', 'type']}
        ariaLabel="Secciones del equipo"
        sections={sections}
      />
    </div>
  );
}
