import { DESTINATION_SELECT } from '@/features/Warehouses/lib/labels';

/** Lineas de la OC con lo necesario para recibir: material y su control, precio y destino. */
export const ORDER_LINE_SELECT = {
  id: true,
  position: true,
  quantity: true,
  unit_price: true,
  vat_rate_id: true,
  request_line_id: true,
  request_line: {
    select: {
      position: true,
      description: true,
      material: { select: { id: true, code: true, name: true, tracking_type: true } },
      unit: { select: { abbreviation: true } },
      request: { select: { id: true, number: true, ...DESTINATION_SELECT } },
    },
  },
} as const;
