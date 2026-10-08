'use client';

/**
 * PDF de una Orden de Mantenimiento completa (ticket 684).
 *
 * Es el registro que se presenta ante una auditoria externa (HSE / ISO): tiene
 * que decir todo lo que se le hizo al equipo, quien lo hizo y cuando, sin que el
 * auditor tenga que abrir el sistema.
 *
 * Tres decisiones estructurales que explican el resto del archivo:
 *
 * 1. **Ancho unico.** Todo — header, reglas, footer, columnas de cualquier tabla,
 *    tambien las anidadas — arranca y termina en el mismo ancho de contenido. No
 *    hay indentacion por nivel: una tabla corrida rompe la alineacion de columnas
 *    y obliga al ojo a leer dos grillas distintas.
 *
 * 2. **La jerarquia la dan el espacio y el peso, no las cajas.** La anidacion
 *    orden -> OT -> tarea se resuelve con una regla superior gruesa, una banda
 *    gris y aire (24 pt entre OT, 0 entre tareas). Tres niveles de marco anidado
 *    serian ilegibles, y react-pdf ademas no colapsa bordes.
 *
 * 3. **Ningun campo se oculta cuando viene vacio.** En un registro de auditoria
 *    la ausencia es el dato. Se imprime el label y un termino del vocabulario
 *    cerrado de `ABSENT`, en italica gris para que se distinga de un valor real.
 */

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  ABSENT,
  PAGE,
  PROSE_WIDTH,
  colors,
  daysBetween,
  font,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatNumber,
  leading,
  pluralize,
  rule,
  space,
  textOr,
  tracking,
  type,
} from './theme';
import type { MaintenanceOrderReportData, ReportMaterial, ReportTask, ReportWorkOrder } from './types';

// ============================================================================
// GRILLA DE COLUMNAS
// ============================================================================

/**
 * Columnas de la tabla de tareas. Suman 100 y se comparten entre el encabezado y
 * las filas: un unico array evita que header y cuerpo se desalineen al editarlos
 * por separado.
 */
const TASK_COLS = {
  code: '5%',
  task: '29%',
  maintenance: '12%',
  criticality: '9%',
  status: '12%',
  performer: '17%',
  closedAt: '16%',
} as const;

/** Columnas de la tabla de materiales (con y sin costos). */
const MATERIAL_COLS = {
  withCost: { workOrder: '28%', material: '44%', quantity: '12%', cost: '16%' },
  withoutCost: { workOrder: '30%', material: '54%', quantity: '16%', cost: '0%' },
} as const;

/** Columnas de la tabla de trazabilidad. */
const TRACE_COLS = {
  milestone: '24%',
  at: '19%',
  by: '25%',
  note: '32%',
} as const;

// ============================================================================
// ESTILOS
// ============================================================================

const styles = StyleSheet.create({
  page: {
    paddingTop: space.xl,
    paddingBottom: PAGE.marginBottom,
    paddingHorizontal: PAGE.marginX,
    fontFamily: font.regular,
    fontSize: type.body,
    color: colors.ink,
  },

  // ── Header fijo ───────────────────────────────────────────────────────────
  header: {
    marginBottom: space.lg,
  },
  headerAccentBar: {
    height: rule.accent,
    backgroundColor: colors.accent,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: rule.regular,
    borderBottomColor: colors.frame,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  headerLogoCell: {
    width: 86,
    justifyContent: 'center',
  },
  /**
   * Medidas fijas en puntos y JPEG aplanado sobre blanco.
   * Un PNG con canal alpha hace que react-pdf calcule mal la proporcion: estira
   * el dibujo y deja un hueco debajo. Los porcentajes producen el mismo defecto.
   */
  headerLogo: {
    width: 78,
    height: 40,
    objectFit: 'contain',
  },
  headerTitleCell: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: space.md,
  },
  docTitle: {
    fontFamily: font.bold,
    fontSize: type.docTitle,
    letterSpacing: tracking.section,
    lineHeight: leading.tight,
  },
  docSubtitle: {
    fontSize: type.label,
    color: colors.inkSecondary,
    marginTop: space.xxs,
    lineHeight: leading.tight,
  },
  headerFolioCell: {
    width: 150,
    alignItems: 'flex-end',
  },
  folioLabel: {
    fontSize: type.label,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
  },
  folioValue: {
    fontFamily: font.bold,
    fontSize: type.folio,
    lineHeight: leading.tight,
    marginTop: 1,
  },
  folioStatus: {
    fontSize: type.label,
    fontFamily: font.bold,
    color: colors.inkSecondary,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
    marginTop: space.xxs,
  },

  // ── Footer fijo ───────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: space.xl,
    left: PAGE.marginX,
    right: PAGE.marginX,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: rule.hairline,
    borderTopColor: colors.hairline,
    paddingTop: space.xs,
  },
  footerLeft: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 120 },
  footerText: {
    fontSize: type.label,
    color: colors.inkMuted,
    lineHeight: leading.cell,
  },

  // ── Secciones ─────────────────────────────────────────────────────────────
  section: {
    marginTop: space.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: rule.strong,
    borderTopColor: colors.rule,
    paddingTop: space.xs,
    marginBottom: space.sm,
  },
  sectionMark: {
    width: 5,
    height: 5,
    backgroundColor: colors.accent,
    marginRight: space.sm,
  },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: type.body,
    textTransform: 'uppercase',
    letterSpacing: tracking.section,
  },
  sectionHint: {
    fontSize: type.label,
    color: colors.inkMuted,
    marginLeft: space.md,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
  },

  // ── Campos label / valor ──────────────────────────────────────────────────
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: rule.hairline,
    borderTopColor: colors.hairline,
    borderLeftWidth: rule.hairline,
    borderLeftColor: colors.hairline,
  },
  field: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRightWidth: rule.hairline,
    borderRightColor: colors.hairline,
    borderBottomWidth: rule.hairline,
    borderBottomColor: colors.hairline,
  },
  fieldLabel: {
    fontSize: type.label,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: type.body,
    lineHeight: leading.cell,
  },
  fieldValueStrong: {
    fontFamily: font.bold,
  },
  /** Unico uso de la italica en el documento: marcar un dato ausente. */
  absentValue: {
    fontFamily: font.oblique,
    color: colors.inkMuted,
  },

  // ── Tablas ────────────────────────────────────────────────────────────────
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.fillHeader,
    borderTopWidth: rule.hairline,
    borderTopColor: colors.rule,
    borderBottomWidth: rule.hairline,
    borderBottomColor: colors.rule,
  },
  headCell: {
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
  },
  headText: {
    fontSize: type.label,
    fontFamily: font.bold,
    lineHeight: leading.tight,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: rule.hairline,
    borderBottomColor: colors.hairline,
  },
  rowAlert: {
    backgroundColor: colors.fillAlert,
  },
  cell: {
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    flexShrink: 1,
    minWidth: 0,
  },
  cellText: {
    fontSize: type.body,
    lineHeight: leading.cell,
  },
  cellTextRight: {
    textAlign: 'right',
  },
  cellTextMuted: {
    color: colors.inkSecondary,
  },
  cellTextBold: {
    fontFamily: font.bold,
  },

  // ── Bloque de orden de trabajo ────────────────────────────────────────────
  workOrder: {
    marginTop: space.xxl,
  },
  workOrderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fillSubtle,
    borderTopWidth: rule.strong,
    borderTopColor: colors.frame,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  workOrderNumber: {
    fontFamily: font.bold,
    fontSize: type.otTitle,
    lineHeight: leading.tight,
  },
  workOrderSector: {
    fontFamily: font.bold,
    fontSize: type.otTitle,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
    lineHeight: leading.tight,
  },
  workOrderSeparator: {
    fontSize: type.otTitle,
    color: colors.inkMuted,
    marginHorizontal: space.sm,
  },
  workOrderHeadRight: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  workOrderStatus: {
    fontSize: type.label,
    fontFamily: font.bold,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
  },
  workOrderMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderBottomWidth: rule.hairline,
    borderBottomColor: colors.hairline,
    paddingVertical: space.xs,
  },
  metaItem: {
    paddingRight: space.lg,
    paddingVertical: space.xxs,
  },
  metaLabel: {
    fontSize: type.label,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
  },
  metaValue: {
    fontSize: type.body,
    lineHeight: leading.cell,
  },

  // ── Detalle de tarea (notas colgadas de su fila) ──────────────────────────
  taskDetail: {
    flexDirection: 'row',
    borderBottomWidth: rule.hairline,
    borderBottomColor: colors.hairline,
    paddingBottom: space.xs,
  },
  taskDetailBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingRight: space.xs,
  },
  taskDetailLine: {
    flexDirection: 'row',
    marginTop: space.xxs,
  },
  taskDetailLabel: {
    fontSize: type.label,
    fontFamily: font.bold,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
    width: 74,
    flexShrink: 0,
  },
  taskDetailText: {
    fontSize: type.label,
    color: colors.inkSecondary,
    lineHeight: leading.prose,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },

  // ── Resumen de ejecucion ──────────────────────────────────────────────────
  metricRow: {
    flexDirection: 'row',
    borderTopWidth: rule.hairline,
    borderTopColor: colors.hairline,
    borderBottomWidth: rule.hairline,
    borderBottomColor: colors.hairline,
  },
  metric: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRightWidth: rule.hairline,
    borderRightColor: colors.hairline,
  },
  metricValue: {
    fontFamily: font.bold,
    fontSize: type.otTitle,
    lineHeight: leading.tight,
  },
  metricLabel: {
    fontSize: type.label,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
    marginTop: space.xxs,
  },
  metricHint: {
    fontSize: type.label,
    color: colors.inkSecondary,
    marginTop: 1,
  },

  // ── Cierre ────────────────────────────────────────────────────────────────
  closingRow: {
    flexDirection: 'row',
  },
  prose: {
    fontSize: type.body,
    lineHeight: leading.prose,
    maxWidth: PROSE_WIDTH,
    textAlign: 'left',
  },
  legendBox: {
    width: 168,
    flexShrink: 0,
    marginLeft: space.xl,
    borderLeftWidth: rule.hairline,
    borderLeftColor: colors.hairline,
    paddingLeft: space.lg,
  },
  legendLine: {
    fontSize: type.label,
    color: colors.inkSecondary,
    lineHeight: leading.prose,
  },

  // ── Firmas ────────────────────────────────────────────────────────────────
  signatureRow: {
    flexDirection: 'row',
    marginTop: space.lg,
  },
  signature: {
    flexGrow: 1,
    flexBasis: 0,
    marginRight: space.xl,
  },
  signatureLast: {
    marginRight: 0,
  },
  signatureLine: {
    borderTopWidth: rule.regular,
    borderTopColor: colors.frame,
    marginTop: 34,
    paddingTop: space.xs,
  },
  signatureRole: {
    fontSize: type.label,
    fontFamily: font.bold,
    textTransform: 'uppercase',
    letterSpacing: tracking.label,
  },
  signatureName: {
    fontSize: type.body,
    marginTop: space.xxs,
    lineHeight: leading.cell,
  },
  signatureHint: {
    fontSize: type.label,
    color: colors.inkMuted,
    marginTop: space.xxs,
  },

  legalNote: {
    fontSize: type.label,
    color: colors.inkMuted,
    lineHeight: leading.prose,
    marginTop: space.xl,
    borderTopWidth: rule.hairline,
    borderTopColor: colors.hairline,
    paddingTop: space.sm,
    maxWidth: 460,
  },
  emptyRow: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderBottomWidth: rule.hairline,
    borderBottomColor: colors.hairline,
  },
});

// ============================================================================
// HELPERS DE PRESENTACION
// ============================================================================

const ABSENT_TERMS: readonly string[] = Object.values(ABSENT);

/** Un valor ausente se distingue de uno real por la italica gris, no por el texto solo. */
function isAbsent(value: string): boolean {
  return ABSENT_TERMS.includes(value);
}

interface FieldProps {
  label: string;
  value: string;
  width: string;
  strong?: boolean;
}

/** Celda label / valor del bloque de identificacion. */
function Field({ label, value, width, strong }: FieldProps) {
  return (
    <View style={[styles.field, { width }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[styles.fieldValue, strong ? styles.fieldValueStrong : {}, isAbsent(value) ? styles.absentValue : {}]}
      >
        {value}
      </Text>
    </View>
  );
}

interface SectionProps {
  index: number;
  title: string;
  hint?: string;
}

function SectionHeader({ index, title, hint }: SectionProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionMark} />
      <Text style={styles.sectionTitle}>{`${index}. ${title}`}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

interface MetaItemProps {
  label: string;
  value: string;
  width: string;
}

function MetaItem({ label, value, width }: MetaItemProps) {
  return (
    <View style={[styles.metaItem, { width }]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, isAbsent(value) ? styles.absentValue : {}]}>{value}</Text>
    </View>
  );
}

interface DetailLineProps {
  label: string;
  value: string;
}

/** Nota colgada debajo de la fila de su tarea. */
function DetailLine({ label, value }: DetailLineProps) {
  return (
    <View style={styles.taskDetailLine}>
      <Text style={styles.taskDetailLabel}>{label}</Text>
      <Text style={styles.taskDetailText}>{value}</Text>
    </View>
  );
}

// ============================================================================
// TABLA DE TAREAS
// ============================================================================

function TaskTableHead() {
  // Sin `fixed` a proposito. Probado sobre react-pdf 4.1.6: marcarlo NO acota la
  // repeticion al bloque de su orden de trabajo — los encabezados de las OT que
  // todavia no empezaron se acumulan igual (4 encabezados en una misma hoja del
  // caso de 40 tareas). Se prefiere perder el encabezado en una continuacion antes
  // que imprimir encabezados de tablas que no estan ahi; la numeracion N.° de cada
  // fila alcanza para ubicar la tarea.
  return (
    <View style={styles.tableHead}>
      <View style={[styles.headCell, { width: TASK_COLS.code }]}>
        <Text style={styles.headText}>N.°</Text>
      </View>
      <View style={[styles.headCell, { width: TASK_COLS.task }]}>
        <Text style={styles.headText}>Tarea ejecutada</Text>
      </View>
      <View style={[styles.headCell, { width: TASK_COLS.maintenance }]}>
        <Text style={styles.headText}>Mantenimiento</Text>
      </View>
      <View style={[styles.headCell, { width: TASK_COLS.criticality }]}>
        <Text style={styles.headText}>Criticidad</Text>
      </View>
      <View style={[styles.headCell, { width: TASK_COLS.status }]}>
        <Text style={styles.headText}>Estado</Text>
      </View>
      <View style={[styles.headCell, { width: TASK_COLS.performer }]}>
        <Text style={styles.headText}>Ejecutó</Text>
      </View>
      <View style={[styles.headCell, { width: TASK_COLS.closedAt }]}>
        <Text style={[styles.headText, styles.cellTextRight]}>Cierre</Text>
      </View>
    </View>
  );
}

interface TaskRowProps {
  task: ReportTask;
}

/**
 * Fila de tarea mas sus notas.
 *
 * Va envuelta en `wrap={false}`: una tarea partida entre dos paginas deja la nota
 * del tecnico huerfana de su titulo y el auditor no puede reconstruir a que
 * reparacion pertenece.
 */
function TaskRow({ task }: TaskRowProps) {
  const details: DetailLineProps[] = [];
  if (task.description?.trim()) details.push({ label: 'Detalle', value: task.description.trim() });
  if (task.technicianNotes?.trim()) details.push({ label: 'Nota técnica', value: task.technicianNotes.trim() });
  if (task.workshopChiefComment?.trim())
    details.push({ label: 'Jefe de taller', value: task.workshopChiefComment.trim() });
  if (task.rejectionReason?.trim()) details.push({ label: 'Rechazo', value: task.rejectionReason.trim() });

  const criticality = task.isCritical ? 'Crítica' : 'Normal';
  const taskName = task.isDiagnostic ? `${task.repairType} (diagnóstico)` : task.repairType;

  return (
    <View wrap={false}>
      <View style={[styles.row, task.isNonConforming ? styles.rowAlert : {}]}>
        <View style={[styles.cell, { width: TASK_COLS.code }]}>
          <Text style={[styles.cellText, styles.cellTextBold]}>{task.code}</Text>
        </View>
        <View style={[styles.cell, { width: TASK_COLS.task }]}>
          <Text style={[styles.cellText, styles.cellTextBold]}>{taskName}</Text>
        </View>
        <View style={[styles.cell, { width: TASK_COLS.maintenance }]}>
          <Text style={[styles.cellText, styles.cellTextMuted]}>{textOr(task.maintenanceType, ABSENT.unassigned)}</Text>
        </View>
        <View style={[styles.cell, { width: TASK_COLS.criticality }]}>
          <Text style={[styles.cellText, task.isCritical ? styles.cellTextBold : styles.cellTextMuted]}>
            {criticality}
          </Text>
        </View>
        <View style={[styles.cell, { width: TASK_COLS.status }]}>
          <Text style={[styles.cellText, task.isNonConforming ? styles.cellTextBold : {}]}>{task.statusLabel}</Text>
        </View>
        <View style={[styles.cell, { width: TASK_COLS.performer }]}>
          <Text
            style={[styles.cellText, isAbsent(textOr(task.completedBy, ABSENT.unassigned)) ? styles.absentValue : {}]}
          >
            {textOr(task.completedBy, ABSENT.unassigned)}
          </Text>
        </View>
        <View style={[styles.cell, { width: TASK_COLS.closedAt }]}>
          <Text style={[styles.cellText, styles.cellTextRight, task.completedAt ? {} : styles.absentValue]}>
            {formatDate(task.completedAt)}
          </Text>
        </View>
      </View>

      {details.length > 0 ? (
        <View style={styles.taskDetail}>
          <View style={{ width: TASK_COLS.code }} />
          <View style={styles.taskDetailBody}>
            {details.map((detail) => (
              <DetailLine key={detail.label} label={detail.label} value={detail.value} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ============================================================================
// MATERIALES (Almacenes etapa 4)
// ============================================================================

function MaterialsTable({ materials, total }: { materials: ReportMaterial[]; total: string | null }) {
  const withCost = materials.some((m) => m.cost !== null);
  const cols = withCost ? MATERIAL_COLS.withCost : MATERIAL_COLS.withoutCost;
  return (
    <View>
      <View style={styles.tableHead}>
        <View style={[styles.headCell, { width: cols.workOrder }]}>
          <Text style={styles.headText}>Orden de trabajo</Text>
        </View>
        <View style={[styles.headCell, { width: cols.material }]}>
          <Text style={styles.headText}>Material</Text>
        </View>
        <View style={[styles.headCell, { width: cols.quantity }]}>
          <Text style={[styles.headText, styles.cellTextRight]}>Cantidad</Text>
        </View>
        {withCost && (
          <View style={[styles.headCell, { width: cols.cost }]}>
            <Text style={[styles.headText, styles.cellTextRight]}>Costo</Text>
          </View>
        )}
      </View>
      {materials.map((m, index) => (
        <View key={`${m.workOrder ?? 'orden'}-${m.material}-${index}`} style={styles.row} wrap={false}>
          <View style={[styles.cell, { width: cols.workOrder }]}>
            <Text style={[styles.cellText, styles.cellTextMuted]}>{m.workOrder ?? 'Toda la orden'}</Text>
          </View>
          <View style={[styles.cell, { width: cols.material }]}>
            <Text style={styles.cellText}>{m.material}</Text>
          </View>
          <View style={[styles.cell, { width: cols.quantity }]}>
            <Text style={[styles.cellText, styles.cellTextRight]}>{m.quantity}</Text>
          </View>
          {withCost && (
            <View style={[styles.cell, { width: cols.cost }]}>
              <Text style={[styles.cellText, styles.cellTextRight]}>{m.cost}</Text>
            </View>
          )}
        </View>
      ))}
      {total !== null && (
        <View style={styles.row} wrap={false}>
          <View style={[styles.cell, { width: '84%' }]}>
            <Text style={[styles.cellText, styles.cellTextBold, styles.cellTextRight]}>Total materiales</Text>
          </View>
          <View style={[styles.cell, { width: '16%' }]}>
            <Text style={[styles.cellText, styles.cellTextBold, styles.cellTextRight]}>{total}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

interface WorkOrderBlockProps {
  workOrder: ReportWorkOrder;
  /**
   * Contenido que viaja pegado a la banda de la OT dentro del bloque no divisible.
   * Lo usa la primera OT para llevar el título de la sección 4: así el título
   * nunca queda solo al pie de una hoja, sin forzar un salto de página.
   */
  leading?: React.ReactNode;
}

/**
 * Bloque de una orden de trabajo: banda de encabezado, metadatos y tabla de tareas.
 *
 * `minPresenceAhead` evita que la banda quede sola al pie de una pagina: si no
 * entran al menos ~110 pt (banda + metadatos + un par de filas), el bloque entero
 * arranca en la pagina siguiente.
 */
function WorkOrderBlock({ workOrder, leading }: WorkOrderBlockProps) {
  const [firstTask, ...remainingTasks] = workOrder.tasks;

  return (
    <View style={styles.workOrder} minPresenceAhead={80}>
      <View wrap={false}>
        {leading}
        <View style={styles.workOrderHead}>
          <Text style={styles.workOrderNumber}>{workOrder.number}</Text>
          <Text style={styles.workOrderSeparator}>/</Text>
          <Text style={styles.workOrderSector}>{textOr(workOrder.sector, ABSENT.unassigned)}</Text>
          <View style={styles.workOrderHeadRight}>
            <Text style={styles.workOrderStatus}>{workOrder.statusLabel}</Text>
          </View>
        </View>

        <View style={styles.workOrderMeta}>
          <MetaItem
            label="Taller"
            value={`${textOr(workOrder.workshop, ABSENT.unassigned)}${
              workOrder.workshop ? (workOrder.isExternalWorkshop ? ' (externo)' : ' (interno)') : ''
            }`}
            width="30%"
          />
          <MetaItem label="Prioridad" value={workOrder.priorityLabel} width="10%" />
          <MetaItem
            label="Planificado"
            value={formatDateRange(workOrder.plannedStart, workOrder.plannedEnd)}
            width="21%"
          />
          <MetaItem label="Ejecutado" value={formatDateRange(workOrder.actualStart, workOrder.actualEnd)} width="21%" />
          <MetaItem label="Cerró" value={textOr(workOrder.completedBy, ABSENT.unassigned)} width="18%" />
        </View>

        {/* La cabecera de la tabla y la primera tarea van dentro del bloque no
            divisible: una OT nunca queda con su banda sola al pie de una hoja y
            la tabla recién en la siguiente. */}
        <TaskTableHead />
        {firstTask ? (
          <TaskRow task={firstTask} />
        ) : (
          <View style={styles.emptyRow}>
            <Text style={[styles.cellText, styles.absentValue]}>Sin tareas registradas en esta orden de trabajo.</Text>
          </View>
        )}
      </View>

      {remainingTasks.map((task) => (
        <TaskRow key={task.code} task={task} />
      ))}

      <View style={styles.taskDetail} wrap={false}>
        <View style={{ width: TASK_COLS.code }} />
        <View style={styles.taskDetailBody}>
          <DetailLine label="Obs. de la OT" value={textOr(workOrder.notes)} />
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

interface MaintenanceOrderReportLayoutProps {
  data: MaintenanceOrderReportData;
}

export function MaintenanceOrderReportLayout({ data }: MaintenanceOrderReportLayoutProps) {
  const { equipment, workOrders, issuance } = data;

  // ── Metricas derivadas ────────────────────────────────────────────────────
  // Una sola pasada sobre las tareas: los contadores y el desglose por tipo de
  // mantenimiento salian de cinco recorridos separados del mismo array.
  let totalTasks = 0;
  let closedTasks = 0;
  let criticalTasks = 0;
  let nonConformingTasks = 0;
  const sectors = new Set<string>();
  const byMaintenanceType = new Map<string, number>();

  for (const workOrder of workOrders) {
    if (workOrder.sector) sectors.add(workOrder.sector);
    for (const task of workOrder.tasks) {
      totalTasks++;
      if (task.completedAt) closedTasks++;
      if (task.isCritical) criticalTasks++;
      if (task.isNonConforming) nonConformingTasks++;
      const key = task.maintenanceType?.trim() || ABSENT.unassigned;
      byMaintenanceType.set(key, (byMaintenanceType.get(key) ?? 0) + 1);
    }
  }

  const workshopDays = daysBetween(data.workshopEntryDate, data.closedAt);

  const sectionFourHeader = (
    <SectionHeader
      index={4}
      title="Detalle de los trabajos realizados"
      hint={pluralize(workOrders.length, 'orden de trabajo', 'órdenes de trabajo', 'Sin órdenes de trabajo')}
    />
  );

  const maintenanceBreakdown = Array.from(byMaintenanceType)
    .map(([label, count]) => `${label}: ${formatNumber(count)}`)
    .join('  ·  ');

  /** El equipo se mide por kilometraje o por horometro, nunca por los dos. */
  const usageLabel = equipment.engineHoursAtEntry ? 'Horómetro al ingreso' : 'Km al ingreso';
  const usageValue = equipment.engineHoursAtEntry
    ? `${equipment.engineHoursAtEntry} h`
    : equipment.kilometerAtEntry
      ? `${equipment.kilometerAtEntry} km`
      : ABSENT.unrecorded;

  return (
    <Document
      title={`Orden de mantenimiento ${data.orderNumber}`}
      author={data.companyName}
      subject="Registro de cierre de orden de mantenimiento"
    >
      <Page size="A4" style={styles.page}>
        {/* ── HEADER (se repite en todas las paginas) ───────────────────── */}
        <View style={styles.header} fixed>
          <View style={styles.headerAccentBar} />
          <View style={styles.headerRow}>
            <View style={styles.headerLogoCell}>
              {data.logoSrc ? <Image style={styles.headerLogo} src={data.logoSrc} /> : null}
            </View>
            <View style={styles.headerTitleCell}>
              <Text style={styles.docTitle}>Orden de mantenimiento</Text>
              <Text style={styles.docSubtitle}>
                {`${data.companyName} · Registro de cierre · ${data.documentCode} Rev. ${data.documentRevision}`}
              </Text>
            </View>
            <View style={styles.headerFolioCell}>
              <Text style={styles.folioLabel}>Orden N.°</Text>
              <Text style={styles.folioValue}>{data.orderNumber}</Text>
              <Text style={styles.folioStatus}>{data.statusLabel}</Text>
            </View>
          </View>
        </View>

        {/* ── FOOTER (se repite en todas las paginas) ───────────────────── */}
        <View style={styles.footer} fixed>
          <View style={styles.footerLeft}>
            <Text style={styles.footerText}>
              {`Emitido el ${formatDateTime(issuance.at)} por ${issuance.by} · Identificador ${issuance.traceId}`}
            </Text>
            <Text style={styles.footerText}>
              {`Orden ${data.orderNumber} · ${equipment.identifierLabel} ${equipment.identifier}`}
            </Text>
          </View>
        </View>

        {/*
          El numero de pagina lleva el estilo inline a proposito: si sale de
          `StyleSheet.create`, react-pdf 4.1.6 recalcula el nodo dinamico con alto 0
          al resolver el `render` por pagina y el texto no se dibuja en ninguna hoja.
          Verificado sobre 4.1.6: el mismo bloque con estilo inline si se imprime.
          Los valores igual salen de los tokens; lo unico que cambia es donde vive el objeto.
        */}
        <Text
          style={{
            position: 'absolute',
            bottom: space.xl,
            right: PAGE.marginX,
            width: 120,
            fontSize: type.label,
            color: colors.inkMuted,
            textAlign: 'right',
          }}
          fixed
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />

        {/* ── 1. IDENTIFICACION ────────────────────────────────────────── */}
        <View>
          <SectionHeader
            index={1}
            title="Identificación del equipo y de la orden"
            hint={`Origen: ${textOr(data.sourceLabel, ABSENT.unrecorded)}`}
          />
          <View style={styles.fieldGrid}>
            <Field label={equipment.identifierLabel} value={equipment.identifier} width="25%" strong />
            <Field label="Tipo de recurso" value={equipment.kindLabel} width="25%" />
            <Field label="N.° interno" value={textOr(equipment.internalNumber, ABSENT.unrecorded)} width="25%" />
            <Field label={usageLabel} value={usageValue} width="25%" />

            <Field label="Tipo" value={textOr(equipment.type, ABSENT.unassigned)} width="25%" />
            <Field label="Subtipo" value={textOr(equipment.subType, ABSENT.unassigned)} width="25%" />
            <Field
              label="Marca y modelo"
              value={
                equipment.brand || equipment.model
                  ? [equipment.brand, equipment.model].filter(Boolean).join(' ')
                  : ABSENT.unassigned
              }
              width="25%"
            />
            <Field label="Año" value={textOr(equipment.year, ABSENT.unrecorded)} width="25%" />

            <Field
              label="Sector operativo"
              value={textOr(equipment.operationalSector, ABSENT.unassigned)}
              width="25%"
            />
            <Field label="Tipo de preventivo" value={textOr(data.preventiveType, ABSENT.notApplicable)} width="25%" />
            <Field label="Fecha planificada" value={formatDate(data.scheduledDate)} width="25%" />
            <Field label="Cierre de la orden" value={formatDate(data.closedAt)} width="25%" strong />
          </View>
        </View>

        {/* ── 2. RESUMEN DE EJECUCION ──────────────────────────────────── */}
        <View style={styles.section} wrap={false}>
          <SectionHeader index={2} title="Resumen de ejecución" hint={maintenanceBreakdown} />
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatNumber(workOrders.length)}</Text>
              <Text style={styles.metricLabel}>Órdenes de trabajo</Text>
              <Text style={styles.metricHint}>
                {pluralize(sectors.size, 'sector', 'sectores', 'Sin sector asignado')}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{`${formatNumber(closedTasks)} / ${formatNumber(totalTasks)}`}</Text>
              <Text style={styles.metricLabel}>Tareas cerradas</Text>
              <Text style={styles.metricHint}>sobre el total registrado</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatNumber(criticalTasks)}</Text>
              <Text style={styles.metricLabel}>Tareas críticas</Text>
              <Text style={styles.metricHint}>
                {pluralize(nonConformingTasks, 'no conformidad', 'no conformidades', 'Sin no conformidades')}
              </Text>
            </View>
            <View style={[styles.metric, { borderRightWidth: 0 }]}>
              <Text style={[styles.metricValue, workshopDays == null ? styles.absentValue : {}]}>
                {workshopDays == null ? ABSENT.unrecorded : formatNumber(workshopDays)}
              </Text>
              <Text style={styles.metricLabel}>Días en taller</Text>
              <Text style={styles.metricHint}>{`Ingreso ${formatDate(data.workshopEntryDate)}`}</Text>
            </View>
          </View>
        </View>

        {/* ── 3. TRAZABILIDAD ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader index={3} title="Trazabilidad de la orden" hint="Hitos del circuito, en orden cronológico" />
          <View style={styles.tableHead}>
            <View style={[styles.headCell, { width: TRACE_COLS.milestone }]}>
              <Text style={styles.headText}>Hito</Text>
            </View>
            <View style={[styles.headCell, { width: TRACE_COLS.at }]}>
              <Text style={styles.headText}>Fecha y hora</Text>
            </View>
            <View style={[styles.headCell, { width: TRACE_COLS.by }]}>
              <Text style={styles.headText}>Responsable</Text>
            </View>
            <View style={[styles.headCell, { width: TRACE_COLS.note }]}>
              <Text style={styles.headText}>Observación</Text>
            </View>
          </View>
          {data.milestones.map((milestone) => {
            const at = formatDateTime(milestone.at);
            const by = textOr(milestone.by, ABSENT.unassigned);
            const note = textOr(milestone.note);
            return (
              <View key={milestone.label} style={styles.row} wrap={false}>
                <View style={[styles.cell, { width: TRACE_COLS.milestone }]}>
                  <Text style={[styles.cellText, styles.cellTextBold]}>{milestone.label}</Text>
                </View>
                <View style={[styles.cell, { width: TRACE_COLS.at }]}>
                  <Text style={[styles.cellText, isAbsent(at) ? styles.absentValue : {}]}>{at}</Text>
                </View>
                <View style={[styles.cell, { width: TRACE_COLS.by }]}>
                  <Text style={[styles.cellText, isAbsent(by) ? styles.absentValue : {}]}>{by}</Text>
                </View>
                <View style={[styles.cell, { width: TRACE_COLS.note }]}>
                  <Text style={[styles.cellText, styles.cellTextMuted, isAbsent(note) ? styles.absentValue : {}]}>
                    {note}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── 4. DETALLE POR ORDEN DE TRABAJO ──────────────────────────── */}
        {/* Sin salto de página forzado: el detalle arranca donde termina la
            trazabilidad. El título viaja dentro del bloque no divisible de la
            primera OT (ver `leading`), así nunca queda solo al pie de la hoja. */}
        <View style={styles.section}>
          {workOrders.length > 0 ? (
            workOrders.map((workOrder, index) => (
              <WorkOrderBlock
                key={workOrder.number}
                workOrder={workOrder}
                leading={index === 0 ? sectionFourHeader : undefined}
              />
            ))
          ) : (
            <View wrap={false}>
              {sectionFourHeader}
              <View style={styles.emptyRow}>
                <Text style={[styles.cellText, styles.absentValue]}>
                  La orden se cerró sin órdenes de trabajo asociadas.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── 5. MATERIALES (Almacenes etapa 4) ─────────────────────────── */}
        <View style={styles.section}>
          <View wrap={false}>
            <SectionHeader
              index={5}
              title="Materiales utilizados"
              hint="Entregados por pedido de materiales, netos de anulaciones"
            />
            {data.materials.length === 0 && (
              <View style={styles.emptyRow}>
                <Text style={[styles.cellText, styles.absentValue]}>No se registraron materiales.</Text>
              </View>
            )}
          </View>
          {data.materials.length > 0 && <MaterialsTable materials={data.materials} total={data.materialsTotal} />}
        </View>

        {/* ── 6. OBSERVACIONES ─────────────────────────────────────────── */}
        {/* No divisible: partida, el recuadro de criterios quedaba cortado entre dos hojas */}
        <View style={styles.section} wrap={false}>
          <SectionHeader index={6} title="Observaciones generales" />
          <View style={styles.closingRow}>
            <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
              <Text style={[styles.prose, data.description?.trim() ? {} : styles.absentValue]}>
                {textOr(data.description)}
              </Text>
            </View>
            <View style={styles.legendBox}>
              <Text style={[styles.legendLine, { fontFamily: font.bold, color: colors.ink }]}>
                Criterios de lectura
              </Text>
              <Text style={styles.legendLine}>Las filas sombreadas señalan tareas rechazadas o reasignadas.</Text>
              <Text style={styles.legendLine}>
                La numeración N.° identifica orden de trabajo y tarea (por ejemplo 2.3).
              </Text>
              <Text style={styles.legendLine}>Los campos en itálica indican datos que el circuito no registró.</Text>
            </View>
          </View>
        </View>

        {/* ── 7. CONFORMIDAD ───────────────────────────────────────────── */}
        <View style={styles.section} wrap={false}>
          <SectionHeader index={7} title="Conformidad" />
          <View style={styles.signatureRow}>
            <View style={styles.signature}>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureRole}>Ejecutó — Jefe de taller</Text>
                <Text style={styles.signatureName}>Aclaración y fecha</Text>
                <Text style={styles.signatureHint}>Responsable de los trabajos detallados</Text>
              </View>
            </View>
            <View style={styles.signature}>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureRole}>Validó — Operaciones</Text>
                <Text style={styles.signatureName}>Aclaración y fecha</Text>
                <Text style={styles.signatureHint}>Conformidad sobre el cierre de la orden</Text>
              </View>
            </View>
            <View style={[styles.signature, styles.signatureLast]}>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureRole}>Recibió — Responsable del equipo</Text>
                <Text style={styles.signatureName}>Aclaración y fecha</Text>
                <Text style={styles.signatureHint}>Recepción del equipo en servicio</Text>
              </View>
            </View>
          </View>

          <Text style={styles.legalNote}>
            {`Este documento refleja el estado de la orden ${data.orderNumber} al momento de su emisión. ` +
              'Los hitos y las tareas provienen del registro del sistema de gestión y no admiten edición ' +
              'retroactiva. Ante diferencias entre dos impresiones del mismo identificador, prevalece la de ' +
              'fecha de emisión más reciente.'}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
