'use client';

import type { ColumnDef } from '@tanstack/react-table';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ExcelColumn {
  /** Key del campo en los datos */
  key: string;
  /** Título de la columna en el Excel */
  title: string;
  /** Ancho de la columna (en caracteres) */
  width?: number;
  /** Función para formatear el valor */
  formatter?: (value: unknown, row: Record<string, unknown>) => string | number | null;
  /** Función de acceso personalizada (de TanStack accessorFn) */
  accessorFn?: (row: Record<string, unknown>) => unknown;
}

export interface CompanyBranding {
  /** Nombre de la empresa */
  name: string;
  /** Logo de la empresa (Buffer o base64 URL) */
  logo?: Buffer | string;
  /** Color primario (hex sin #) */
  primaryColor?: string;
  /** Color secundario (hex sin #) */
  secondaryColor?: string;
  /** Color de acento (hex sin #) */
  accentColor?: string;
}

export interface ExcelExportOptions {
  /** Nombre del archivo (sin extensión) */
  filename: string;
  /** Nombre de la hoja */
  sheetName?: string;
  /** Título del reporte (se muestra en la primera fila) */
  title?: string;
  /** Incluir fecha de generación */
  includeDate?: boolean;
  /** Branding de la empresa (opcional) */
  companyBranding?: CompanyBranding;
}

/** Colores del tema por defecto */
const DEFAULT_THEME = {
  primary: '374151', // gray-700
  secondary: '6b7280', // gray-500
  accent: '3b82f6', // blue-500
  headerText: 'FFFFFF',
  alternateRow: 'f9fafb', // gray-50
  border: 'e5e7eb', // gray-200
};

/**
 * Genera el tema de colores basado en el branding de la empresa
 */
function getTheme(branding?: CompanyBranding) {
  if (!branding) return DEFAULT_THEME;

  return {
    primary: branding.primaryColor || DEFAULT_THEME.primary,
    secondary: branding.secondaryColor || DEFAULT_THEME.secondary,
    accent: branding.accentColor || DEFAULT_THEME.accent,
    headerText: DEFAULT_THEME.headerText,
    alternateRow: DEFAULT_THEME.alternateRow,
    border: DEFAULT_THEME.border,
  };
}

/**
 * Exporta datos a un archivo Excel con estilos
 */
export async function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  columns: ExcelColumn[],
  options: ExcelExportOptions
): Promise<void> {
  const { filename, sheetName = 'Datos', title, includeDate = true, companyBranding } = options;

  // Obtener tema de colores
  const THEME = getTheme(companyBranding);

  // Crear workbook y worksheet
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyBranding?.name || 'Sistema de Gestión';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: title ? 4 : 1 }],
  });

  let currentRow = 1;

  // Header con logo y título (opcional)
  if (title || companyBranding) {
    const hasLogo = !!companyBranding?.logo;

    // Logo (si existe)
    if (hasLogo && companyBranding?.logo) {
      try {
        let logoBuffer: Buffer;
        if (typeof companyBranding.logo === 'string') {
          const base64Data = companyBranding.logo.split(',')[1] || '';
          logoBuffer = Buffer.from(base64Data, 'base64');
        } else {
          logoBuffer = companyBranding.logo;
        }

        const imageId = workbook.addImage({
          buffer: logoBuffer as unknown as ExcelJS.Image['buffer'],
          extension: 'png',
        });

        worksheet.addImage(imageId, {
          tl: { col: 0.2, row: 0.2 },
          ext: { width: 120, height: 60 },
        });

        // Ajustar altura de la primera fila para el logo
        worksheet.getRow(1).height = 50;
      } catch (error) {
        // Si falla la carga del logo, continuar sin él
        import('@/lib/logger').then(({ logger }) => {
          logger.warn('Error al cargar logo en Excel', { data: { error } });
        });
      }
    }

    // Nombre de la empresa (en la misma fila del logo, pero a la derecha)
    if (companyBranding?.name) {
      const startCol = hasLogo ? 3 : 1;
      worksheet.mergeCells(currentRow, startCol, currentRow, columns.length);
      const companyCell = worksheet.getCell(currentRow, startCol);
      companyCell.value = companyBranding.name.toUpperCase();
      companyCell.font = {
        bold: true,
        size: 14,
        color: { argb: THEME.primary },
      };
      companyCell.alignment = { horizontal: hasLogo ? 'left' : 'center', vertical: 'middle' };
      if (!hasLogo) worksheet.getRow(currentRow).height = 30;
      currentRow++;
    } else if (hasLogo) {
      currentRow++; // Espacio para el logo
    }

    // Título del reporte
    if (title) {
      worksheet.mergeCells(currentRow, 1, currentRow, columns.length);
      const titleCell = worksheet.getCell(currentRow, 1);
      titleCell.value = title;
      titleCell.font = {
        bold: true,
        size: 16,
        color: { argb: THEME.accent },
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'f3f4f6' }, // gray-100
      };
      titleCell.border = {
        top: { style: 'thin', color: { argb: THEME.border } },
        bottom: { style: 'thin', color: { argb: THEME.border } },
      };
      worksheet.getRow(currentRow).height = 35;
      currentRow++;
    }

    // Fecha de generación y datos del usuario
    if (includeDate) {
      worksheet.mergeCells(currentRow, 1, currentRow, columns.length);
      const dateCell = worksheet.getCell(currentRow, 1);
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      dateCell.value = `Generado el ${dateStr} a las ${timeStr}`;
      dateCell.font = {
        size: 10,
        italic: true,
        color: { argb: '6b7280' },
      };
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(currentRow).height = 20;
      currentRow++;
    }

    // Fila vacía
    currentRow++;
  }

  // Encabezados de columnas
  const headerRow = worksheet.getRow(currentRow);
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.title;
    cell.font = {
      bold: true,
      color: { argb: THEME.headerText },
      size: 12,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: THEME.primary },
    };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    cell.border = {
      top: { style: 'medium', color: { argb: THEME.primary } },
      bottom: { style: 'medium', color: { argb: THEME.primary } },
      left: { style: 'thin', color: { argb: THEME.border } },
      right: { style: 'thin', color: { argb: THEME.border } },
    };
  });
  headerRow.height = 30;
  currentRow++;

  // Datos
  data.forEach((item, rowIndex) => {
    const row = worksheet.getRow(currentRow + rowIndex);
    const isAlternate = rowIndex % 2 === 1;

    columns.forEach((col, colIndex) => {
      const cell = row.getCell(colIndex + 1);

      // Obtener valor: usar accessorFn si existe, sino nested key
      let value = col.accessorFn ? col.accessorFn(item) : getNestedValue(item, col.key);

      // Aplicar formatter si existe
      if (col.formatter) {
        value = col.formatter(value, item);
      } else if (value && typeof value === 'object') {
        // Auto-extraer 'name' de objetos de relación si no hay formatter
        const objValue = value as Record<string, unknown>;
        if ('name' in objValue) {
          value = objValue.name;
        } else if ('firstName' in objValue && 'lastName' in objValue) {
          // Para objetos como employee con firstName/lastName
          value = `${objValue.lastName}, ${objValue.firstName}`;
        } else {
          // Fallback: convertir a string vacío para evitar [object Object]
          value = '';
        }
      }

      cell.value = (value as string | number | boolean | Date | null) ?? '';
      cell.alignment = { vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: THEME.border } },
        bottom: { style: 'thin', color: { argb: THEME.border } },
        left: { style: 'thin', color: { argb: THEME.border } },
        right: { style: 'thin', color: { argb: THEME.border } },
      };

      // Fila alternada
      if (isAlternate) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: THEME.alternateRow },
        };
      }
    });

    row.height = 20;
  });

  // Configurar anchos de columna
  columns.forEach((col, index) => {
    const column = worksheet.getColumn(index + 1);
    column.width = col.width || calculateColumnWidth(col, data);
  });

  // Agregar autofiltro en los encabezados
  const headerRowNumber = title ? (includeDate ? 4 : 3) : 1;
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: columns.length },
  };

  // Generar y descargar
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `${filename}.xlsx`);
}

/**
 * Obtiene un valor anidado de un objeto usando dot notation
 * Ejemplo: getNestedValue({ contact: { name: 'Juan' } }, 'contact.name') => 'Juan'
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
  }, obj as unknown);
}

/**
 * Calcula el ancho óptimo de una columna basado en el contenido
 */
function calculateColumnWidth<T extends Record<string, unknown>>(column: ExcelColumn, data: T[]): number {
  const MIN_WIDTH = 10;
  const MAX_WIDTH = 50;
  const PADDING = 2;

  // Ancho del título
  let maxWidth = column.title.length;

  // Ancho máximo del contenido (muestreamos los primeros 100 registros)
  const sample = data.slice(0, 100);
  for (const item of sample) {
    let value = column.accessorFn ? column.accessorFn(item) : getNestedValue(item, column.key);
    if (column.formatter) {
      value = column.formatter(value, item);
    } else if (value && typeof value === 'object') {
      // Auto-extraer 'name' de objetos de relación
      const objValue = value as Record<string, unknown>;
      if ('name' in objValue) {
        value = objValue.name;
      } else if ('firstName' in objValue && 'lastName' in objValue) {
        value = `${objValue.lastName}, ${objValue.firstName}`;
      } else {
        value = '';
      }
    }
    const length = String(value ?? '').length;
    if (length > maxWidth) {
      maxWidth = length;
    }
  }

  return Math.min(Math.max(maxWidth + PADDING, MIN_WIDTH), MAX_WIDTH);
}

/**
 * Convierte columnas de TanStack Table a ExcelColumns
 * Extrae el meta.title, accessorKey y accessorFn.
 * Soporta:
 * - `meta.excludeFromExport: true` para excluir columnas individuales
 * - `meta.exportFormatter` como formatter explícito para la exportación
 * - `accessorFn` para columnas que no usan accessorKey
 */
/**
 * Shape mínimo de una `ColumnDef` de TanStack que usa la exportación. `ColumnDef` es una
 * unión discriminada (accessorKey / accessorFn / display) y `meta` es abierto, por eso se
 * lee a través de este tipo estructural.
 */
type ExportableTanstackColumn = {
  id?: string;
  accessorKey?: string;
  accessorFn?: unknown;
  meta?: { title?: string; excludeFromExport?: boolean; exportFormatter?: unknown };
};

export function tanstackColumnsToExcelColumns<T extends Record<string, unknown>>(
  tanstackColumns: ReadonlyArray<ColumnDef<T, unknown>>,
  options?: {
    /** Columnas a excluir por accessorKey o id */
    exclude?: string[];
    /** Formatters personalizados por key */
    formatters?: Record<string, (value: unknown, row: T) => string | number | null>;
  }
): ExcelColumn[] {
  const { exclude = ['select', 'actions'], formatters = {} } = options || {};
  const columns = tanstackColumns as ReadonlyArray<ExportableTanstackColumn>;

  return columns
    .filter((col) => {
      // Excluir columnas marcadas con meta.excludeFromExport
      if (col.meta?.excludeFromExport) return false;
      const key = col.accessorKey || col.id;
      return key && !exclude.includes(key);
    })
    .map((col) => {
      // El filter anterior garantiza que hay key.
      const key = col.accessorKey || col.id || '';
      const title = col.meta?.title || key;

      // Prioridad de formatter: formatters param > meta.exportFormatter > undefined
      const formatter = (formatters[key] ?? col.meta?.exportFormatter) as ExcelColumn['formatter'];

      // Si la columna usa accessorFn y no tiene accessorKey, incluirla
      const accessorFn =
        !col.accessorKey && col.accessorFn ? (col.accessorFn as (row: Record<string, unknown>) => unknown) : undefined;

      return {
        key,
        title,
        formatter,
        accessorFn,
      };
    });
}
