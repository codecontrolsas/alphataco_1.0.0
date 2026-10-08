import { defineSection } from '../define.ts';

/**
 * Paneles fuera del dashboard (/clothing, /operator, /maintenance): no tienen `screens` (el botón
 * "?" solo vive en el dashboard) ni `access` (no dependen de los permisos por rol).
 */
export const campoSection = defineSection({
  key: 'campo',
  title: 'Paneles para el personal de campo',
  description: 'Entrega de indumentaria, panel del operario de taller y QR de equipos.',
  icon: 'field',
  guides: [
    {
      slug: 'qr-del-equipo',
      related: ['del-checklist-al-taller', 'validar-solicitudes', 'formularios', 'ficha-del-vehiculo'],
    },
    {
      slug: 'panel-del-operario',
      related: ['taller', 'vista-taller', 'del-checklist-al-taller', 'pedidos-de-materiales'],
    },
    {
      slug: 'entrega-de-indumentaria',
      related: ['ficha-del-empleado', 'catalogo-de-indumentaria', 'materiales', 'movimientos-de-stock', 'depositos'],
    },
  ],
});
