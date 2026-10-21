/**
 * Tokens y formatters del PDF de Orden de Mantenimiento.
 *
 * Todo valor visual del documento (color, espacio, filete, tamaño de letra) sale
 * de acá. Ningún `StyleSheet.create` del layout debe escribir un numero suelto:
 * si hace falta un valor nuevo, se agrega como token.
 *
 * Unidad: puntos PostScript (1 pt = 1/72"). Es la unidad nativa de react-pdf.
 */

import moment from 'moment';

// ============================================================================
// GEOMETRIA DE PAGINA
// ============================================================================

/** A4 en puntos. */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  /** Margenes laterales. El ancho de contenido se deriva de aca. */
  marginX: 32,
  /** Reserva para el header fijo (se repite en todas las paginas). */
  marginTop: 30,
  /** Reserva para el footer fijo. */
  marginBottom: 34,
} as const;

/**
 * Medida maxima para prosa (~65 caracteres a 8 pt en Helvetica).
 *
 * El ancho util completo daria ~119 caracteres por linea: ilegible. Los bloques
 * de texto libre (observaciones, motivos de rechazo, notas del tecnico) se
 * acotan a esta medida en vez de ocupar la pagina entera.
 */
export const PROSE_WIDTH = 340;

// ============================================================================
// COLOR
// ============================================================================

/**
 * Paleta propia del documento impreso: gris calido `#4C4948` y naranja `#E67819`.
 * NO sigue el theme de la app (`src/app/globals.css`): react-pdf no lee variables CSS
 * y este documento se disena para papel, no para pantalla.
 *
 * El documento es **monocromo**. El naranja se usa solo como filete y marca de
 * folio, nunca como texto: sobre blanco da ~2.4:1 de contraste.
 *
 * Los estados NO se codifican por color — llevan siempre texto — porque este
 * documento se fotocopia y se imprime en blanco y negro.
 */
export const colors = {
  /** Texto principal. Off-black calido, no negro absoluto. */
  ink: '#1C1B1A',
  /** Valores secundarios y texto de apoyo. */
  inkSecondary: '#57534E',
  /** Labels en versalita y metadata del pie. Piso de legibilidad a 6.5 pt. */
  inkMuted: '#6B6560',
  /** Acento institucional. Solo filetes y marcas, jamas texto. */
  accent: '#E67819',
  /** Version oscura del acento, apta para texto pequeno si hiciera falta. */
  accentDeep: '#A85206',

  /** Filete interno entre filas. */
  hairline: '#C9C5C2',
  /** Regla de separacion entre bloques. */
  rule: '#8A8481',
  /** Marco exterior de los bloques enmarcados. */
  frame: '#1C1B1A',

  /** Fondo de fila de encabezado de tabla. */
  fillHeader: '#E7E3E0',
  /** Fondo sutil: banda de orden de trabajo, celdas de label. */
  fillSubtle: '#F5F3F1',
  /** Fondo de una fila no conforme (rechazo). Pastel lavado, imprime limpio. */
  fillAlert: '#FBEAE7',
  /** Texto de una marca no conforme. */
  inkAlert: '#8C2F1E',

  white: '#FFFFFF',
} as const;

// ============================================================================
// ESPACIADO
// ============================================================================

/**
 * Escala de espaciado base 4. Los saltos son deliberados: mucho aire antes de un
 * titulo de seccion, poco entre label y valor. Repetir un unico valor en todo el
 * documento hace que todo pese igual.
 */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
} as const;

// ============================================================================
// FILETES
// ============================================================================

/**
 * Un unico sistema de linea para todo el documento.
 *
 * Ojo: react-pdf **no colapsa bordes**. Dos celdas contiguas con borde completo
 * dibujan 1 pt duplicado. Por eso cada celda aplica el borde en una sola
 * direccion (`borderRightWidth` + `borderBottomWidth`) y el contorno lo cierra
 * el contenedor padre.
 */
export const rule = {
  hairline: 0.5,
  regular: 0.75,
  strong: 1,
  /** Marca de bloque: filete superior del header y de cada seccion mayor. */
  accent: 2,
} as const;

// ============================================================================
// TIPOGRAFIA
// ============================================================================

/**
 * Cinco tamanos, tres caras (Helvetica / Bold / Oblique).
 *
 * Los saltos son claros a proposito: dos roles a menos de 1.5 pt de distancia no
 * se distinguen, asi que los niveles que comparten tamano se separan por peso,
 * caja y tracking — no por medio punto.
 *
 * La escala se verifica con la prueba del entrecerrado: al mirar la pagina
 * rasterizada y borrosa hay que poder distinguir Orden / Seccion / OT / Tarea
 * sin leer el texto.
 */
export const font = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  /** Reservada para un unico uso: los terminos de ausencia de dato. */
  oblique: 'Helvetica-Oblique',
} as const;

export const type = {
  /** Numero de orden en el header. Unica cifra grande: es el ancla del documento. */
  folio: 16,
  /** Titulo del documento. */
  docTitle: 11,
  /** Encabezado de una orden de trabajo. */
  otTitle: 9,
  /** Cuerpo: celdas de tabla, valores, prosa. Tambien titulos de seccion (en bold + versalita). */
  body: 8,
  /** Labels en versalita, encabezados de columna, pie de pagina. */
  label: 6.5,
} as const;

/**
 * Interlineado por rol. Helvetica en espanol (tildes, ñ) necesita aire: el
 * default de react-pdf aprieta las mayusculas acentuadas contra la linea de
 * arriba. Una celda que envuelve a 3 lineas nunca puede quedar en 1.1.
 */
export const leading = {
  tight: 1.15,
  cell: 1.3,
  prose: 1.5,
} as const;

/** Tracking positivo: los labels chicos en mayusculas se agolpan sin el. */
export const tracking = {
  label: 0.5,
  section: 0.8,
} as const;

// ============================================================================
// VOCABULARIO DE AUSENCIA
// ============================================================================

/**
 * Cuatro terminos con significados distintos, usados siempre igual.
 *
 * En un registro de auditoria la ausencia **es** el dato: ningun campo se oculta
 * cuando viene vacio. Se imprime el label y uno de estos terminos, nunca un
 * guion suelto ni una redaccion inventada en el momento.
 */
export const ABSENT = {
  /** FK sin resolver: sector, taller, responsable. */
  unassigned: 'Sin asignar',
  /** Fecha o medicion que el circuito nunca capturo. */
  unrecorded: 'Sin registrar',
  /** Campo de texto libre que quedo vacio. */
  noNotes: 'Sin observaciones',
  /** El campo no corresponde a este tipo de orden o de recurso. */
  notApplicable: 'No aplica',
} as const;

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Parseo unico de fechas del documento.
 *
 * `parseZone` conserva el huso que trae el dato en vez de convertirlo al del
 * proceso que genera el PDF. Sin esto, un hito guardado a las 09:14 -03:00 se
 * imprime con la hora del servidor donde corre el render, y en un registro de
 * auditoria una hora corrida es un dato falso, no un detalle de formato.
 */
function parse(value: Date | string) {
  return typeof value === 'string' ? moment.parseZone(value) : moment(value);
}

/**
 * Fecha en formato argentino. Una sola funcion para todo el documento: evita que
 * un `moment(null).format()` suelto imprima "Invalid date" en un registro que se
 * presenta ante un auditor.
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return ABSENT.unrecorded;
  const parsed = parse(value);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : ABSENT.unrecorded;
}

/** Fecha con hora, para los hitos de trazabilidad. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return ABSENT.unrecorded;
  const parsed = parse(value);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY HH:mm') : ABSENT.unrecorded;
}

/**
 * Rango de fechas con guion medio (en dash), no con hyphen.
 * Si falta alguno de los dos extremos, el rango no se arma a medias.
 */
export function formatDateRange(from: Date | string | null | undefined, to: Date | string | null | undefined): string {
  if (!from && !to) return ABSENT.unrecorded;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** Texto libre, o el termino de ausencia que corresponda. */
export function textOr(value: string | null | undefined, absent: string = ABSENT.noNotes): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : absent;
}

/** Numero con separador de miles es-AR (1.234). */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ABSENT.unrecorded;
  return new Intl.NumberFormat('es-AR').format(value);
}

/**
 * Duracion en dias entre dos instantes, redondeada hacia arriba.
 * Devuelve `null` cuando no se puede medir: un cero inventado se leeria como
 * "no tardo nada", que es una afirmacion distinta a "no hay medicion".
 */
export function daysBetween(
  from: Date | string | null | undefined,
  to: Date | string | null | undefined
): number | null {
  if (!from || !to) return null;
  const a = parse(from);
  const b = parse(to);
  if (!a.isValid() || !b.isValid()) return null;
  return Math.max(0, Math.ceil(b.diff(a, 'days', true)));
}

/**
 * Frase completa con plural resuelto. Nunca armar la oracion concatenando
 * fragmentos alrededor de una variable: "1 tareas" es un defecto visible.
 */
export function pluralize(count: number, singular: string, plural: string, empty: string): string {
  if (count === 0) return empty;
  if (count === 1) return `1 ${singular}`;
  return `${formatNumber(count)} ${plural}`;
}
