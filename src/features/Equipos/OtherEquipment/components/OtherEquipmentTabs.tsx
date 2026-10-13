'use client';

import type { OtherEquipmentDetail } from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { OtherEquipmentMaintenanceTable } from '@/features/Equipos/OtherEquipment/maintenance/OtherEquipmentMaintenanceTable';
import { TabsManagerClientSide } from '@/features/TabsManager/TabsManagerClientSide';
import type { TabDefinition } from '@/features/TabsManager/types';
import { OtherEquipmentQr } from './OtherEquipmentQr';
import { OtherEquipmentAssignmentView, OtherEquipmentBasicDataView } from './view/OtherEquipmentDataView';

interface OtherEquipmentTabsProps {
  equipment: OtherEquipmentDetail;
  certificationsComponent?: React.ReactNode;
  qrComponent?: React.ReactNode;
}

/**
 * Pestañas de la ficha del equipamiento en modo lectura. La edición y el alta no pasan por acá:
 * usan `form/OtherEquipmentEditLayout`, con el formulario completo en una sola página.
 */
export function OtherEquipmentTabs({ equipment, certificationsComponent, qrComponent }: OtherEquipmentTabsProps) {
  const equipmentLabel = equipment.serial_number || equipment.intern_number || equipment.id;

  // 'mantenimiento' además de 'equipos': la tab de Mantenimiento hereda los
  // permisos del historial de mantenimiento, que vive en ese módulo (ticket 596)
  const tabs: TabDefinition<'equipos' | 'mantenimiento'>[] = [
    {
      value: 'basicData',
      label: 'Datos del equipo',
      moduleSlug: 'equipos',
      tabSlug: 'datos-basicos-otro',
      content: <OtherEquipmentBasicDataView equipment={equipment} />,
    },
    {
      value: 'assignmentData',
      label: 'Asignación',
      moduleSlug: 'equipos',
      tabSlug: 'asignacion-otro',
      content: <OtherEquipmentAssignmentView equipment={equipment} />,
    },
    {
      value: 'certifications',
      label: 'Documentos',
      moduleSlug: 'equipos',
      tabSlug: 'certificaciones-otro',
      content: certificationsComponent,
    },
    {
      // Ticket 596: los equipamientos entran al circuito de mantenimiento.
      // Hereda los permisos del historial de mantenimiento de vehículos.
      value: 'maintenance',
      label: 'Mantenimiento',
      moduleSlug: 'mantenimiento',
      tabSlug: 'ordenes_mantenimiento',
      content: <OtherEquipmentMaintenanceTable equipmentId={equipment.id} />,
    },
  ];

  // El código QR solo existe para los tipos que lo generan
  if (equipment.type?.generates_qr) {
    tabs.push({
      value: 'qr',
      label: 'Código QR',
      moduleSlug: 'equipos',
      tabSlug: 'qr-otro-equipo',
      content: qrComponent ?? <OtherEquipmentQr equipmentId={equipment.id} equipmentLabel={equipmentLabel} />,
    });
  }

  return (
    <TabsManagerClientSide
      paramName="tab"
      defaultTab="basicData"
      variant="line"
      tabs={tabs}
      listClassName="h-11 w-full justify-start overflow-x-auto"
      triggerClassName="text-foreground/60 hover:text-foreground data-[state=active]:text-foreground flex-none px-4 font-medium transition-colors data-[state=active]:font-semibold data-[state=active]:shadow-none"
    />
  );
}
