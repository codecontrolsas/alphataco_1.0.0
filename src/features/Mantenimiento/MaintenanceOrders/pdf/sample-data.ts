/**
 * Datos de ejemplo del PDF de Orden de Mantenimiento.
 *
 * No es un fixture de relleno: reproduce el caso mas denso que el layout tiene
 * que aguantar, porque es la unica forma de ver si la maqueta se rompe.
 * Ejercita a proposito:
 *
 * - Cuatro ordenes de trabajo, una de ellas **sin tareas y sin sector asignado**.
 * - Una tarea rechazada y una reasignada (filas no conformes).
 * - Un item de diagnostico.
 * - Observaciones de ~600 caracteres, para verificar la medida de linea.
 * - Apellidos con tilde y con ene, para confirmar que Helvetica los imprime.
 * - Campos nulos en cada nivel: fecha sin registrar, responsable sin asignar,
 *   observacion vacia, campo que no aplica.
 *
 * Las etiquetas de estado estan escritas con el mismo texto que
 * `MO_STATUS_CONFIG` y `WO_STATUS_CONFIG` en
 * `WorkshopView/WorkshopSectorTasksTable/columns.tsx`. Al conectar el PDF a la
 * server action deben salir de esos mapas, no de aca.
 */

import type { MaintenanceOrderReportData } from './types';

export const sampleMaintenanceOrderReport: MaintenanceOrderReportData = {
  orderNumber: 'OM-2026-0184',
  statusLabel: 'Completada',
  sourceLabel: 'Checklist de operador',
  preventiveType: 'Service de 500 horas',
  description:
    'El equipo ingresó al taller por desvíos detectados en el checklist del 12/08 y por el service ' +
    'preventivo de 500 horas, que vencía en la misma semana. Durante el desarme se detectó juego ' +
    'excesivo en el bulón del segundo tramo del brazo, que no figuraba en el pedido original y se ' +
    'incorporó como tarea adicional con autorización de Operaciones. La reparación del cilindro de ' +
    'giro se derivó a un taller externo por falta de herramental propio para el prensado. El equipo ' +
    'se entregó operativo, con la salvedad de que el sensor de ángulo quedó pendiente de reemplazo ' +
    'a la espera del repuesto importado.',
  createdAt: '2026-08-12T09:14:00-03:00',
  scheduledDate: '2026-08-18',
  workshopEntryDate: '2026-08-18T07:40:00-03:00',
  closedAt: '2026-08-27T16:20:00-03:00',

  equipment: {
    kindLabel: 'Vehículo',
    identifier: 'AE 412 KZ',
    identifierLabel: 'Dominio',
    internalNumber: '148',
    type: 'Hidrogrúa',
    subType: 'Camión con hidrogrúa',
    brand: 'Iveco',
    model: 'Trakker 380',
    year: '2019',
    operationalSector: 'Base Añelo',
    kilometerAtEntry: '214.380',
    engineHoursAtEntry: null,
  },

  milestones: [
    {
      label: 'Solicitud generada',
      at: '2026-08-12T09:14:00-03:00',
      by: 'Nahuel Ñancufil',
      note: 'Desvíos del checklist RO 06-1 del 12/08.',
    },
    {
      label: 'Planificación',
      at: '2026-08-13T11:02:00-03:00',
      by: 'Gabriela Ríos',
      note: null,
    },
    {
      label: 'Fecha confirmada',
      at: '2026-08-14T08:35:00-03:00',
      by: 'Gabriela Ríos',
      note: 'Ingreso acordado con Operaciones para el 18/08.',
    },
    {
      label: 'Ingreso a taller',
      at: '2026-08-18T07:40:00-03:00',
      by: 'Héctor Muñoz',
      note: null,
    },
    {
      label: 'Ampliación de alcance',
      at: '2026-08-21T15:10:00-03:00',
      by: 'Héctor Muñoz',
      note: 'Se incorpora el reemplazo del bulón del segundo tramo, autorizado por Operaciones.',
    },
    {
      label: 'Validación de taller',
      at: '2026-08-27T09:05:00-03:00',
      by: 'Héctor Muñoz',
      note: null,
    },
    {
      label: 'Validación de Operaciones',
      at: '2026-08-27T16:20:00-03:00',
      by: 'Damián Sepúlveda',
      note: 'Se acepta el cierre con el sensor de ángulo pendiente de repuesto.',
    },
  ],

  workOrders: [
    {
      number: 'OT-2026-0411',
      sector: 'Mecánica',
      workshop: 'Taller Central Añelo',
      isExternalWorkshop: false,
      statusLabel: 'Completada',
      priorityLabel: 'Alta',
      plannedStart: '2026-08-18',
      plannedEnd: '2026-08-21',
      actualStart: '2026-08-18T08:10:00-03:00',
      actualEnd: '2026-08-21T17:30:00-03:00',
      completedBy: 'Héctor Muñoz',
      notes:
        'Se trabajó con el equipo sobre fosa. El desarme del segundo tramo demandó una jornada más ' +
        'de lo planificado por el estado del bulón.',
      tasks: [
        {
          code: '1.1',
          repairType: 'Service de motor 500 h',
          description: 'Cambio de aceite, filtros de aceite, aire y combustible.',
          maintenanceType: 'Preventivo',
          isCritical: false,
          isDiagnostic: false,
          statusLabel: 'Completada',
          isNonConforming: false,
          completedAt: '2026-08-19T12:15:00-03:00',
          completedBy: 'Iván Coronel',
          technicianNotes: null,
          workshopChiefComment: null,
          rejectionReason: null,
        },
        {
          code: '1.2',
          repairType: 'Reemplazo de bulón de brazo',
          description: 'Segundo tramo del brazo: juego excesivo detectado durante el desarme.',
          maintenanceType: 'Correctivo',
          isCritical: true,
          isDiagnostic: false,
          statusLabel: 'Completada',
          isNonConforming: false,
          completedAt: '2026-08-21T16:40:00-03:00',
          completedBy: 'Héctor Muñoz',
          technicianNotes:
            'Se reemplazó el bulón y los dos bujes. El alojamiento presentaba ovalización leve, ' +
            'dentro de tolerancia según el manual del fabricante. Se recomienda control en el ' +
            'próximo service.',
          workshopChiefComment: 'Tarea incorporada fuera del pedido original, con autorización.',
          rejectionReason: null,
        },
        {
          code: '1.3',
          repairType: 'Control de par de apriete',
          description: null,
          maintenanceType: 'Preventivo',
          isCritical: false,
          isDiagnostic: false,
          statusLabel: 'Completada',
          isNonConforming: false,
          completedAt: '2026-08-21T17:05:00-03:00',
          completedBy: 'Iván Coronel',
          technicianNotes: null,
          workshopChiefComment: null,
          rejectionReason: null,
        },
        {
          code: '1.4',
          repairType: 'Verificación de pérdidas de aceite',
          description: 'Inspección visual del cárter y del mando final.',
          maintenanceType: 'Preventivo',
          isCritical: false,
          isDiagnostic: true,
          statusLabel: 'Completada',
          isNonConforming: false,
          completedAt: '2026-08-19T14:00:00-03:00',
          completedBy: 'Iván Coronel',
          technicianNotes: 'Sin pérdidas activas. Rastros secos de aceite en el mando final.',
          workshopChiefComment: null,
          rejectionReason: null,
        },
      ],
    },
    {
      number: 'OT-2026-0412',
      sector: 'Hidráulica',
      workshop: 'Hidráulica del Comahue S.R.L.',
      isExternalWorkshop: true,
      statusLabel: 'Parcial',
      priorityLabel: 'Urgente',
      plannedStart: '2026-08-19',
      plannedEnd: '2026-08-25',
      actualStart: '2026-08-20T09:00:00-03:00',
      actualEnd: '2026-08-26T18:00:00-03:00',
      completedBy: 'Damián Sepúlveda',
      notes: null,
      tasks: [
        {
          code: '2.1',
          repairType: 'Reparación de cilindro de giro',
          description: 'Prensado y reemplazo de kit de sellos.',
          maintenanceType: 'Correctivo',
          isCritical: true,
          isDiagnostic: false,
          statusLabel: 'Completada',
          isNonConforming: false,
          completedAt: '2026-08-26T17:20:00-03:00',
          completedBy: 'Taller externo',
          technicianNotes: 'Se entregó con remito 0004-00012877. Prueba de estanqueidad conforme.',
          workshopChiefComment: null,
          rejectionReason: null,
        },
        {
          code: '2.2',
          repairType: 'Reemplazo de sensor de ángulo',
          description: 'Sensor del limitador de momento.',
          maintenanceType: 'Correctivo',
          isCritical: true,
          isDiagnostic: false,
          statusLabel: 'Rechazada',
          isNonConforming: true,
          completedAt: null,
          completedBy: null,
          technicianNotes: null,
          workshopChiefComment: null,
          rejectionReason:
            'Repuesto sin stock en plaza. Pedido de importación con entrega estimada a 45 días. ' +
            'El equipo opera con el limitador en modo degradado, según instructivo del fabricante.',
        },
        {
          code: '2.3',
          repairType: 'Cambio de mangueras de alta presión',
          description: null,
          maintenanceType: 'Preventivo',
          isCritical: false,
          isDiagnostic: false,
          statusLabel: 'Completada',
          isNonConforming: false,
          completedAt: '2026-08-25T11:30:00-03:00',
          completedBy: 'Taller externo',
          technicianNotes: null,
          workshopChiefComment: null,
          rejectionReason: null,
        },
      ],
    },
    {
      number: 'OT-2026-0413',
      sector: 'Gomería',
      workshop: 'Taller Central Añelo',
      isExternalWorkshop: false,
      statusLabel: 'Completada',
      priorityLabel: 'Media',
      plannedStart: '2026-08-26',
      plannedEnd: '2026-08-27',
      actualStart: '2026-08-26T08:00:00-03:00',
      actualEnd: '2026-08-27T10:45:00-03:00',
      completedBy: 'Rubén Paillalef',
      notes: null,
      tasks: [
        {
          code: '3.1',
          repairType: 'Rotación de neumáticos',
          description: null,
          maintenanceType: 'Preventivo',
          isCritical: false,
          isDiagnostic: false,
          statusLabel: 'Completada',
          isNonConforming: false,
          completedAt: '2026-08-26T10:20:00-03:00',
          completedBy: 'Rubén Paillalef',
          technicianNotes: null,
          workshopChiefComment: null,
          rejectionReason: null,
        },
        {
          code: '3.2',
          repairType: 'Reemplazo de neumático delantero derecho',
          description: 'Desgaste irregular en el hombro externo.',
          maintenanceType: 'Correctivo',
          isCritical: false,
          isDiagnostic: false,
          statusLabel: 'Reasignada',
          isNonConforming: true,
          completedAt: '2026-08-27T10:40:00-03:00',
          completedBy: 'Rubén Paillalef',
          technicianNotes: null,
          workshopChiefComment:
            'Se reasignó desde Mecánica: la tarea corresponde al sector Gomería por tipo de trabajo.',
          rejectionReason: null,
        },
      ],
    },
    {
      number: 'OT-2026-0414',
      sector: null,
      workshop: null,
      isExternalWorkshop: false,
      statusLabel: 'Cancelada',
      priorityLabel: 'Baja',
      plannedStart: '2026-08-26',
      plannedEnd: '2026-08-27',
      actualStart: null,
      actualEnd: null,
      completedBy: null,
      notes: 'Se canceló al confirmarse que el trabajo eléctrico estaba cubierto por la OT-2026-0412.',
      tasks: [],
    },
  ],

  companyName: 'Empresa Demo S.R.L.',
  materials: [
    { workOrder: 'OT-2026-0412 · Hidráulica', material: 'HID-68 · Aceite hidráulico ISO 68', quantity: '32 l', cost: '$ 166.400,00' },
    { workOrder: 'OT-2026-0412 · Hidráulica', material: 'KIT-SELL · Kit de sellos de cilindro', quantity: '1 u', cost: '$ 48.500,00' },
  ],
  materialsTotal: '$ 214.900,00',

  documentCode: 'RG MT-08',
  documentRevision: '1',

  issuance: {
    at: '2026-09-10T10:32:00-03:00',
    by: 'Gabriela Ríos',
    traceId: 'a7f4c9e1',
  },
};
