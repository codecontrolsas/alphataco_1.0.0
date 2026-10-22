'use client';

import { TEMPLATES_WITH_ITEM_OBSERVATIONS } from '@/features/Checklists/lib/checklist-form-schema';
import { logger } from '@/lib/logger';
import { BRAND_NAME } from '@/shared/lib/branding';
import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import {
  PAPER_FORM_CODES,
  PAPER_PARTS_DIAGRAMS,
  distributeSectionsIntoColumns,
  formatAnswer,
  hasCriticalItems,
  processSections,
  type ChecklistTemplateSection,
  type FormattedAnswer,
  type ProcessedSection,
} from './normalized-checklist-pdf-data';
import { styles } from './normalized-checklist-pdf-styles';

interface NormalizedChecklistPDFLayoutProps {
  templateName: string;
  templateCode: string;
  logoUrl?: string;
  date?: string;
  revision?: string;
  // Datos dinámicos del checklist (estructura del sistema)
  sections?: ChecklistTemplateSection[];
  // Datos del equipo/inspección
  dominio?: string;
  tipoEquipo?: string;
  fluidoTransportable?: string;
  cliente?: string;
  observaciones?: string;
  fechaInspeccion?: string;
  // Nombre del chofer (TODO: reemplazar por imagen de firma cuando esté disponible)
  chofer?: string;
  // Flag para indicar si es un PDF vacío (sin respuestas)
  isEmpty?: boolean;
  // Respuestas del checklist (para PDFs con datos)
  answers?: Record<string, string>;
  /**
   * Observaciones por item, indexadas por `seccion__item` tal como se guardan en
   * `answer_data.item_observations`. Solo se usan en las plantillas que replican
   * un formulario en papel con esa columna.
   */
  itemObservations?: Record<string, string>;
}

// Componente para renderizar una sección con sus items
const ChecklistSectionComponent = ({
  section,
  answers,
  isEmpty,
  observations,
  showObservations = false,
}: {
  section: ProcessedSection;
  answers?: Record<string, string>;
  isEmpty?: boolean;
  /** Observaciones por item, indexadas por código de item. Si se pasa, se agrega la columna. */
  observations?: Record<string, string>;
  showObservations?: boolean;
}) => {
  // Verificar si algún item de la sección requiere validación izq/der
  const hasSideValidation = section.items.some((item) => item.requiresSideValidation);

  logger.info('section', { data: { section } });
  logger.info('section.items', { data: { items: section.items } });

  return (
    <>
      {/* Header de la sección */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderNumber}>
          <Text style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold' }}>#</Text>
        </View>
        <View style={styles.sectionHeaderTitle}>
          <Text style={styles.sectionHeaderTitleText}>{section.name}</Text>
        </View>
        {hasSideValidation ? (
          // Header dividido con Estado / IZQ | DER
          <View style={styles.sectionHeaderEstadoSplit}>
            <View style={styles.sectionHeaderEstadoSplitTop}>
              <Text style={styles.sectionHeaderEstadoText}>Estado</Text>
            </View>
            <View style={styles.sectionHeaderEstadoSplitBottom}>
              <View style={styles.sectionHeaderEstadoSplitCellLeft}>
                <Text style={styles.sectionHeaderEstadoSplitText}>IZQ</Text>
              </View>
              <View style={styles.sectionHeaderEstadoSplitCell}>
                <Text style={styles.sectionHeaderEstadoSplitText}>DER</Text>
              </View>
            </View>
          </View>
        ) : (
          // Header normal
          <View style={styles.sectionHeaderEstado}>
            <Text style={styles.sectionHeaderEstadoText}>Estado</Text>
          </View>
        )}
        {showObservations && (
          <View style={styles.sectionHeaderObservacion}>
            <Text style={styles.sectionHeaderEstadoText}>Observaciones</Text>
          </View>
        )}
      </View>
      {/* Items de la sección */}
      {section.items.map((item, index) => {
        // Obtener la respuesta si existe
        const answer = answers?.[item.code];
        const answerLeft = answers?.[`${item.code}_left`];
        const answerRight = answers?.[`${item.code}_right`];
        // Formatear la respuesta para mostrar (con colores de fondo)
        const emptyAnswer: FormattedAnswer = { text: '' };
        const displayAnswer = isEmpty ? emptyAnswer : formatAnswer(answer);
        const displayAnswerLeft = isEmpty ? emptyAnswer : formatAnswer(answerLeft);
        const displayAnswerRight = isEmpty ? emptyAnswer : formatAnswer(answerRight);

        // Los items de texto libre y de fecha no responden B/M/NA: su valor
        // necesita el ancho de Estado más el de Observaciones para no quedar
        // cortado (una fecha DD/MM/AAAA no entra en los 28 de Estado).
        const esTextoLibre = item.inputType === 'text';
        // Solo en las plantillas con columna de OBSERVACIONES: ahí sobra ancho
        // para la fecha. En el resto se deja la celda de Estado como estaba.
        const esFechaAncha = showObservations && item.inputType === 'date';
        const esValorAncho = esTextoLibre || esFechaAncha;

        return (
          <View key={index} style={styles.itemRow}>
            <View style={styles.itemNumber}>
              <Text>{item.number}</Text>
            </View>
            <View style={styles.itemLabel}>
              <Text style={styles.itemLabelText}>
                {item.label}
                {item.isCritical ? ' (*)' : ''}
              </Text>
            </View>
            {esValorAncho ? (
              <View
                style={[
                  styles.itemValorLibre,
                  { width: showObservations ? 138 : 28 },
                  displayAnswer.backgroundColor ? { backgroundColor: displayAnswer.backgroundColor } : {},
                ]}
              >
                <Text style={styles.itemValorLibreText}>
                  {isEmpty ? '' : esTextoLibre ? answer ?? '' : displayAnswer.text}
                </Text>
              </View>
            ) : hasSideValidation ? (
              // Celda dividida o normal según el item
              item.requiresSideValidation ? (
                // Celda dividida para items con IZQ/DER
                <View style={styles.itemEstadoSplit}>
                  <View
                    style={[
                      styles.itemEstadoSplitCellLeft,
                      displayAnswerLeft.backgroundColor ? { backgroundColor: displayAnswerLeft.backgroundColor } : {},
                    ]}
                  >
                    <Text style={styles.itemEstadoText}>{displayAnswerLeft.text}</Text>
                  </View>
                  <View
                    style={[
                      styles.itemEstadoSplitCell,
                      displayAnswerRight.backgroundColor ? { backgroundColor: displayAnswerRight.backgroundColor } : {},
                    ]}
                  >
                    <Text style={styles.itemEstadoText}>{displayAnswerRight.text}</Text>
                  </View>
                </View>
              ) : (
                // Celda normal pero con el ancho de la dividida (para alineación)
                <View
                  style={[
                    styles.itemEstado,
                    displayAnswer.backgroundColor ? { backgroundColor: displayAnswer.backgroundColor } : {},
                  ]}
                >
                  <Text style={styles.itemEstadoText}>{displayAnswer.text}</Text>
                </View>
              )
            ) : (
              // Celda normal
              <View
                style={[
                  styles.itemEstado,
                  displayAnswer.backgroundColor ? { backgroundColor: displayAnswer.backgroundColor } : {},
                ]}
              >
                <Text style={styles.itemEstadoText}>{displayAnswer.text}</Text>
              </View>
            )}
            {showObservations && !esValorAncho && (
              <View style={styles.itemObservacion}>
                <Text style={styles.itemObservacionText}>{isEmpty ? '' : observations?.[item.code] ?? ''}</Text>
              </View>
            )}
          </View>
        );
      })}
    </>
  );
};

export const NormalizedChecklistPDFLayout = ({
  templateName = 'Check list',
  templateCode = '',
  logoUrl,
  date,
  revision,
  sections = [],
  dominio = '',
  tipoEquipo = '',
  fluidoTransportable = '',
  cliente = '',
  observaciones = '',
  fechaInspeccion = '',
  // TODO: reemplazar por imagen de firma cuando esté disponible
  chofer = '',
  isEmpty = true,
  answers = {},
  itemObservations = {},
}: NormalizedChecklistPDFLayoutProps) => {
  logger.info('PDF sections', { data: { sectionsCount: sections.length } });
  // Procesar secciones del formato del sistema al formato interno
  const processedSections = processSections(sections);

  // Distribuir secciones en columnas (una o dos según la cantidad de items)
  const { leftSections, rightSections, useSingleColumn } = distributeSectionsIntoColumns(processedSections);

  // Verificar si hay items críticos para mostrar la nota
  const showCriticalNote = hasCriticalItems(processedSections);

  // Columna OBSERVACIONES por item: solo en las plantillas que replican un papel
  // que la tenía. Las claves llegan como `seccion__item`; acá se reindexan por
  // código de item, que es lo que la tabla usa para buscar.
  const showObservations = TEMPLATES_WITH_ITEM_OBSERVATIONS.has(templateCode);
  const observationsByItem: Record<string, string> = {};
  if (showObservations) {
    Object.entries(itemObservations).forEach(([key, text]) => {
      const separator = key.indexOf('__');
      observationsByItem[separator >= 0 ? key.slice(separator + 2) : key] = text;
    });
  }

  // Hoja de referencia de partes: mismo criterio que el código de papel, la
  // leyenda se parte en dos columnas como en el formulario original.
  const partsDiagram = PAPER_PARTS_DIAGRAMS[templateCode];
  const partsDiagramSplit = partsDiagram ? Math.ceil(partsDiagram.parts.length / 2) : 0;
  const partsDiagramLeft = partsDiagram ? partsDiagram.parts.slice(0, partsDiagramSplit) : [];
  const partsDiagramRight = partsDiagram ? partsDiagram.parts.slice(partsDiagramSplit) : [];

  // Formatear el código. Las plantillas que replican un formulario en papel usan
  // el código, la fecha de emisión y la revisión reales del documento; el resto
  // mantiene el `code` interno y la fecha del día, como venía.
  const paper = PAPER_FORM_CODES[templateCode];
  const formattedCode = paper ? `RO ${paper.code}` : templateCode ? `RO ${templateCode}` : '';
  const displayRevision = paper ? `Rev.:${paper.revision}` : revision || 'Rev.:1';
  const showTransportedFluid = !paper?.hideTransportedFluid;

  const displayDate =
    paper?.issueDate ||
    date ||
    new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  // Nombre del archivo PDF (para el visor nativo)
  const sanitizedName = templateName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]/g, '').replace(/\s+/g, '_');
  const pdfFileName = `Checklist_${sanitizedName}_${new Date().toISOString().split('T')[0]}`;

  return (
    <Document title={pdfFileName}>
      <Page size="A4" style={styles.page}>
        {/* Header principal */}
        <View style={styles.headerContainer}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            {logoUrl ? (
              <Image style={styles.logo} src={logoUrl} />
            ) : (
              <Text style={{ fontSize: 11, fontWeight: 700 }}>{BRAND_NAME}</Text>
            )}
          </View>

          {/* Título central */}
          <View style={styles.titleContainer}>
            <Text style={styles.titleMain}>{templateName}</Text>
            <View style={styles.titleSubRow}>
              <View style={styles.titleSubCell}>
                <Text style={styles.titleSubLabel}>Dominio:</Text>
                <Text style={styles.titleSubValue}>{dominio}</Text>
              </View>
              <View style={styles.titleSubCell}>
                <Text style={styles.titleSubLabel}>Tipo de Equipo:</Text>
                <Text style={styles.titleSubValue}>{tipoEquipo}</Text>
              </View>
              <View style={showTransportedFluid ? styles.titleSubCell : styles.titleSubCellLast}>
                <Text style={styles.titleSubLabel}>Cliente:</Text>
                <Text style={styles.titleSubValue}>{cliente}</Text>
              </View>
              {showTransportedFluid && (
                <View style={styles.titleSubCellLast}>
                  <Text style={styles.titleSubLabel}>Fluido Transportable:</Text>
                  <Text style={styles.titleSubValue}>{fluidoTransportable}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Código, fecha y revisión */}
          <View style={styles.headerInfoContainer}>
            <View style={styles.headerInfoCell}>
              <Text style={styles.headerInfoText}>{formattedCode}</Text>
            </View>
            <View style={styles.headerInfoCell}>
              <Text style={styles.headerInfoText}>{displayDate}</Text>
            </View>
            <View style={styles.headerInfoCellLast}>
              <Text style={styles.headerInfoText}>{displayRevision}</Text>
            </View>
          </View>
        </View>

        {/* Línea de referencias */}
        <View style={styles.referencesRow}>
          <Text style={styles.referencesText}>
            REFERENCIAS ESTADO TERMINOLOGIA A UTILIZAR: B (Bien) - M (Mal) - NA (No Aplica)
          </Text>
        </View>

        {/* Tabla principal - una o dos columnas según la cantidad de items */}
        {useSingleColumn ? (
          // Layout de columna única (cuando hay pocos items)
          <View style={styles.mainTableSingleColumn}>
            <View style={styles.columnFull}>
              {leftSections.map((section, index) => (
                <ChecklistSectionComponent
                  key={index}
                  section={section}
                  answers={answers}
                  isEmpty={isEmpty}
                  observations={observationsByItem}
                  showObservations={showObservations}
                />
              ))}
            </View>
          </View>
        ) : (
          // Layout de dos columnas (cuando hay muchos items)
          <View style={styles.mainTable}>
            {/* Columna izquierda */}
            <View style={styles.columnLeft}>
              {leftSections.map((section, index) => (
                <ChecklistSectionComponent
                  key={index}
                  section={section}
                  answers={answers}
                  isEmpty={isEmpty}
                  observations={observationsByItem}
                  showObservations={showObservations}
                />
              ))}
            </View>

            {/* Columna derecha */}
            <View style={styles.column}>
              {rightSections.map((section, index) => (
                <ChecklistSectionComponent
                  key={index}
                  section={section}
                  answers={answers}
                  isEmpty={isEmpty}
                  observations={observationsByItem}
                  showObservations={showObservations}
                />
              ))}
            </View>
          </View>
        )}

        {/* Diagrama de referencia de partes (solo plantillas que lo traen del papel) */}
        {partsDiagram && (
          <View style={styles.partesContainer} wrap={false}>
            <View style={styles.partesHeader}>
              <Text style={styles.partesHeaderText}>{partsDiagram.title}</Text>
            </View>
            <View style={styles.partesBody}>
              <Image style={styles.partesImage} src={partsDiagram.src} />
              <View style={styles.partesLegend}>
                {[partsDiagramLeft, partsDiagramRight].map((column, columnIndex) => (
                  <View key={columnIndex} style={styles.partesLegendColumn}>
                    {column.map(([number, label]) => (
                      <View key={number} style={styles.partesLegendRow}>
                        <View style={styles.partesLegendNumber}>
                          <Text style={styles.partesLegendNumberText}>{number}</Text>
                        </View>
                        <Text style={styles.partesLegendLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Sección de Observaciones */}
        <View style={styles.observacionesContainer}>
          <View style={styles.observacionesHeader}>
            <Text style={styles.observacionesHeaderText}>Observaciones:</Text>
          </View>
          <View style={styles.observacionesContent}>
            <Text style={styles.observacionesText}>{observaciones}</Text>
          </View>

          {/* Nota de elementos críticos (solo si hay items críticos) */}
          {showCriticalNote && (
            <View style={styles.criticalNote}>
              <Text style={styles.criticalNoteText}>(*) ELEMENTOS CRITICOS A INSPECCIONAR</Text>
            </View>
          )}

          {/* Fecha */}
          <View style={styles.fechaRow}>
            <Text style={styles.fechaLabel}>Fecha:</Text>
            <Text style={styles.fechaValue}>{fechaInspeccion}</Text>
          </View>

          {/* Firmas */}
          <View style={styles.firmasContainer}>
            <View style={styles.firmaSection}>
              {/* TODO: reemplazar por imagen de firma cuando esté disponible */}
              {chofer ? <Text style={styles.firmaChoferName}>{chofer}</Text> : <View style={styles.firmaLine}></View>}
              <Text style={styles.firmaText}>Firma y Aclaracion del Chofer</Text>
            </View>
            <View style={styles.firmaSection}>
              <View style={styles.firmaLine}></View>
              <Text style={styles.firmaText}>Firma y Aclaracion del Supervisor</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};
