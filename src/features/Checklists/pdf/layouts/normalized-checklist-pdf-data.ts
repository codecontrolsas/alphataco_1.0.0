import { isSideValidationItem } from '@/features/Checklists/lib/checklist-evaluation';
import { colors } from './normalized-checklist-pdf-styles';

// Estructura de datos que viene del sistema (desde checklist_template_sections + checklist_template_items)
export interface ChecklistTemplateItem {
  id: string;
  code: string;
  label: string;
  order_index: number;
  is_critical?: boolean;
  requires_side_validation?: boolean;
  input_type?: string;
}

export interface ChecklistTemplateSection {
  id: string;
  code: string;
  name: string;
  order_index: number;
  checklist_template_items: ChecklistTemplateItem[];
}

// Interfaz interna para secciones procesadas
export interface ProcessedSection {
  name: string;
  items: Array<{
    number: number;
    label: string;
    code: string;
    isCritical: boolean;
    requiresSideValidation: boolean;
    /** Necesario para dar más espacio a los items de texto libre */
    inputType?: string;
  }>;
}

// Interfaz para respuesta formateada con color
export interface FormattedAnswer {
  text: string;
  backgroundColor?: string;
}

// Función para obtener el color de fondo según el estado de la fecha
export function getDateBackgroundColor(dateStr: string): string | undefined {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calcular diferencia en días
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    // Fecha vencida
    return colors.expiredBg;
  } else if (diffDays <= 30) {
    // Próxima a vencer (≤30 días)
    return colors.warningBg;
  } else {
    // Vigente (>30 días)
    return colors.validBg;
  }
}

// Función para formatear las respuestas con color de fondo
export function formatAnswer(answer?: string): FormattedAnswer {
  if (!answer) return { text: '' };

  // Detectar si es una fecha en formato ISO (YYYY-MM-DD)
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (isoDateRegex.test(answer)) {
    // Convertir de YYYY-MM-DD a DD/MM/YYYY
    const [year, month, day] = answer.split('-');
    return {
      text: `${day}/${month}/${year}`,
      backgroundColor: getDateBackgroundColor(answer),
    };
  }

  // Mapear valores comunes a B/M/NA
  const lowerAnswer = answer.toLowerCase();
  if (lowerAnswer === 'bien' || lowerAnswer === 'b' || lowerAnswer === 'ok' || lowerAnswer === 'si') {
    return { text: 'B', backgroundColor: colors.goodBg };
  }
  if (lowerAnswer === 'mal' || lowerAnswer === 'm' || lowerAnswer === 'no') {
    return { text: 'M', backgroundColor: colors.badBg };
  }
  // "No aplica": sin color de fondo, no es ni bueno ni malo. Se contemplan las
  // variantes históricas ('nc', 'no corresponde') por si quedaron respuestas viejas.
  if (
    lowerAnswer === 'na' ||
    lowerAnswer === 'no aplica' ||
    lowerAnswer === 'n/a' ||
    lowerAnswer === 'nc' ||
    lowerAnswer === 'no corresponde'
  ) {
    return { text: 'NA' };
  }

  // Si es otro valor, mostrar las primeras 3 letras
  return { text: answer.substring(0, 3).toUpperCase() };
}

// Función para procesar las secciones del sistema al formato interno
export function processSections(sections: ChecklistTemplateSection[]): ProcessedSection[] {
  // Ordenar secciones por order_index
  const sortedSections = [...sections].sort((a, b) => a.order_index - b.order_index);

  let globalItemNumber = 1;

  return sortedSections.map((section) => {
    // Ordenar items por order_index
    const sortedItems = [...section.checklist_template_items].sort((a, b) => a.order_index - b.order_index);

    const processedItems = sortedItems.map((item) => ({
      number: globalItemNumber++,
      label: item.label,
      code: item.code,
      isCritical: item.is_critical ?? false,
      requiresSideValidation: isSideValidationItem(item),
      inputType: item.input_type,
    }));

    return {
      name: section.name,
      items: processedItems,
    };
  });
}

// Cantidad máxima de filas por columna (items + headers de sección)
// Con el diseño compacto, podemos poner más filas por columna
const MAX_ROWS_PER_COLUMN = 65;

// Función para calcular el total de filas (items + headers de sección)
export function getTotalRowCount(sections: ProcessedSection[]): number {
  return sections.reduce((total, section) => total + 1 + section.items.length, 0);
}

// Función para distribuir secciones en dos columnas de forma balanceada
// Si una sección es muy grande, se divide entre las dos columnas
// Si el total de filas es menor a MAX_ROWS_PER_COLUMN, usa una sola columna
export function distributeSectionsIntoColumns(sections: ProcessedSection[]): {
  leftSections: ProcessedSection[];
  rightSections: ProcessedSection[];
  useSingleColumn: boolean;
} {
  if (sections.length === 0) {
    return { leftSections: [], rightSections: [], useSingleColumn: true };
  }

  // Calcular el total de filas
  const totalRows = getTotalRowCount(sections);

  // Si todo cabe en una sola columna, usar layout de columna única
  if (totalRows <= MAX_ROWS_PER_COLUMN) {
    return { leftSections: sections, rightSections: [], useSingleColumn: true };
  }

  // Necesitamos dos columnas
  const leftSections: ProcessedSection[] = [];
  const rightSections: ProcessedSection[] = [];
  let leftRowCount = 0;

  for (const section of sections) {
    const sectionHeaderRows = 1; // El header de la sección cuenta como 1 fila
    const sectionItems = section.items;

    // Si la columna izquierda ya está llena, todo va a la derecha
    if (leftRowCount >= MAX_ROWS_PER_COLUMN) {
      rightSections.push(section);
      continue;
    }

    // Calcular cuántas filas quedan disponibles en la columna izquierda
    const remainingLeftRows = MAX_ROWS_PER_COLUMN - leftRowCount;

    // Si la sección completa cabe en la izquierda
    if (sectionHeaderRows + sectionItems.length <= remainingLeftRows) {
      leftSections.push(section);
      leftRowCount += sectionHeaderRows + sectionItems.length;
    } else {
      // La sección no cabe completa, hay que dividirla
      // Cuántos items caben en la izquierda (restando el header)
      const itemsForLeft = Math.max(0, remainingLeftRows - sectionHeaderRows);

      if (itemsForLeft > 0) {
        // Crear sección parcial para la izquierda
        const leftPartialSection: ProcessedSection = {
          name: section.name,
          items: sectionItems.slice(0, itemsForLeft),
        };
        leftSections.push(leftPartialSection);
        leftRowCount += sectionHeaderRows + itemsForLeft;

        // Crear sección parcial para la derecha (con el resto de items)
        const remainingItems = sectionItems.slice(itemsForLeft);
        if (remainingItems.length > 0) {
          const rightPartialSection: ProcessedSection = {
            name: section.name + ' (cont.)', // Indicar que es continuación
            items: remainingItems,
          };
          rightSections.push(rightPartialSection);
        }
      } else {
        // No caben items en la izquierda, toda la sección va a la derecha
        rightSections.push(section);
      }
    }
  }

  return { leftSections, rightSections, useSingleColumn: false };
}

// Función para verificar si hay items críticos
export function hasCriticalItems(sections: ProcessedSection[]): boolean {
  return sections.some((section) => section.items.some((item) => item.isCritical));
}

/**
 * Nomenclatura oficial del formulario en papel que replica cada plantilla
 * (ticket 689): código RO, fecha de emisión y revisión del documento. Van en el
 * encabezado en lugar del `code` interno y de la fecha de generación del PDF;
 * la fecha de la inspección sigue al pie.
 *
 * `revision` es string porque '0' es una revisión válida; vacío = el documento
 * no la informa. `hideTransportedFluid` saca la celda "Fluido Transportable" en
 * los formularios que no la llevan.
 */
export const PAPER_FORM_CODES: Record<
  string,
  { code: string; issueDate: string; revision: string; hideTransportedFluid?: boolean }
> = {
  hidrogrua: { code: '06-1', issueDate: '02/03/2026', revision: '3' },
  pick_up: { code: '01-2', issueDate: '02/03/2026', revision: '5' },
  carreton_petrol: { code: '01-17', issueDate: '02/03/2026', revision: '0' },
  porta_acopl: { code: '01-10', issueDate: '02/03/2026', revision: '5' },
  camilla: { code: '01-9', issueDate: '05/03/2026', revision: '' },
  retro: { code: '01-6', issueDate: '05/03/2026', revision: '6' },
  vactor: { code: '08-2', issueDate: '02/03/2026', revision: '4' },
  eq_vacio_c_semi: { code: '01-18', issueDate: '05/03/2026', revision: '0' },
  tte_personal: { code: '01-16', issueDate: '05/03/2026', revision: '1', hideTransportedFluid: true },
  eq_lavado: { code: '08-5', issueDate: '05/03/2026', revision: '1' },
  testeo: { code: '07-3', issueDate: '05/03/2026', revision: '0' },
  vuelta_360: { code: '05-2', issueDate: '03/03/2026', revision: '6' },
};

/**
 * Diagrama de referencia de partes que el formulario en papel incluye junto al
 * checklist. Los números del dibujo se explican en la leyenda, igual que en el
 * RO 06-1 original.
 */
export const PAPER_PARTS_DIAGRAMS: Record<string, { src: string; title: string; parts: Array<[number, string]> }> = {
  hidrogrua: {
    // JPEG aplanado sobre blanco: el PNG con alpha lo deforma react-pdf al maquetarlo.
    src: '/diagramas/hidrogrua-partes-pdf.jpg',
    title: 'Nomenclatura de partes de la hidrogrúa',
    parts: [
      [1, 'Estructura'],
      [2, 'Columna'],
      [3, 'Brazo Primario'],
      [4, 'Brazo Secundario'],
      [5, 'Primera Prolongación'],
      [6, 'Segunda Prolongación'],
      [7, 'Tercera Prolongación'],
      [8, 'Cuarta Prolongación'],
      [9, 'Barra de estabilización'],
      [10, 'Cremallera de rotación'],
      [11, 'Cilindro estabilizador'],
      [12, 'Cilindro de elevación'],
      [13, 'Cilindro de articulación'],
      [14, 'Cilindro de extensión'],
    ],
  },
};
