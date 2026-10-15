/**
 * Figuras isométricas del manual: nombre → descripción accesible por defecto (el `aria-label` del
 * SVG). Módulo SIN imports a propósito: el validador (`npm run manual:check`) corre con Node a
 * secas y lo importa para rechazar un `<Figure name="…">` que no exista, sin arrastrar el kit
 * de dibujo ni los alias de `@/`.
 *
 * El registro con las funciones que dibujan (`registry.ts`) está tipado contra estas claves: no
 * puede faltar ni sobrar una.
 */
export const FIGURE_LABELS = {
  'taller-circuito':
    'Línea de cuatro estaciones del taller: Por programar, Por ingresar, En taller y Aprobaciones. Un pedido avanza de una a otra y el equipo entra al taller en la tercera.',
  'validacion-solicitud':
    'Una solicitud con varios ítems sobre una cinta. Cada ítem pasa por una compuerta: los aprobados siguen hacia el pedido del taller y los rechazados caen a una bandeja aparte.',
  'cubiertas-posiciones':
    'Chasis de un camión visto en perspectiva con las cubiertas numeradas del 1 al 11: por eje, de izquierda a derecha; los ejes duales tienen exterior e interior; el auxilio es la última posición.',
  'vencimientos-regla':
    'Regla de treinta días con una marca en hoy. Las carpetas de documentos están sobre su fecha de vencimiento: las ya vencidas en rojo, las que vencen en siete días o menos en ámbar y el resto dentro de la ventana de treinta días.',
  'salida-directa':
    'Una caja de material recorre tres compuertas en fila: permiso de salida directa, aprobación y monto máximo. Si pasa las tres se registra la salida; si alguna la frena, se desvía a la vía del pedido de materiales.',
  'parte-cierre-nocturno':
    'Bandejas de partes diarios con sus líneas, y un pórtico de escaneo que pasa a las 00:30: marca cerrado completo cuando todas las líneas están resueltas y cerrado incompleto cuando queda alguna pendiente.',
} as const;

export type FigureName = keyof typeof FIGURE_LABELS;

export const FIGURE_NAMES = Object.keys(FIGURE_LABELS) as FigureName[];
