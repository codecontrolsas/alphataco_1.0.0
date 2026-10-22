/**
 * Tipos públicos del input de reparaciones manuales.
 *
 * Viven aparte del componente (1.016 líneas) para que los formularios que lo consumen
 * importen sólo los tipos, sin arrastrar el árbol de UI.
 */

/** Máximo de fotos por reparación — mismo límite que el formulario anterior del sistema */
export const MAX_IMAGES_PER_REPAIR = 3;

export type RepairTypeOption = {
  id: string;
  name: string | null;
};

/**
 * Grupo de reparación ya expandido a sus tareas.
 *
 * El componente recibe los nombres resueltos (y no solo los ids) para poder
 * mostrar la vista previa del grupo aunque el listado general de reparaciones
 * todavía no haya cargado o haya fallado.
 */
export type RepairGroupOption = {
  id: string;
  name: string;
  description: string | null;
  repairTypes: RepairTypeOption[];
};

/**
 * Una reparación cargada a mano. Puede venir de un tipo del sistema
 * (`repairTypeId`) o ser texto libre (`freeText`) cuando el solicitante no
 * encuentra el ítem que necesita.
 */
export type ManualRepair = {
  /** ID local, solo para React key / remove. No se persiste */
  localId: string;
  repairTypeId: string | null;
  freeText: string | null;
  description: string;
  /** Archivos elegidos; se suben al confirmar el pedido */
  images: File[];
  /**
   * Grupo del que salió esta reparación, o null si se cargó suelta.
   *
   * Se persiste (`maintenance_group_id`) para poder decir en TODO listado de qué
   * grupo vino cada tarea: al expandir un grupo aparecen muchas reparaciones de
   * golpe y sin esta marca el taller no distingue las que se agregaron a propósito
   * de las que entraron por el paquete.
   */
  groupId: string | null;
};

/**
 * Resultado de intentar guardar el borrador al avanzar de paso.
 *
 * `incomplete` es el caso del bug reportado en la demo: hay trabajo cargado
 * (fotos, descripción) pero falta el título, así que la reparación no se puede
 * agregar. Antes esto dejaba el botón "Siguiente" deshabilitado sin explicación y
 * el usuario perdía el esfuerzo de sacar y subir las fotos.
 */
export type PendingDraftCommit =
  | { status: 'added' }
  | { status: 'empty' }
  | { status: 'incomplete'; imageCount: number; hasDescription: boolean };

/**
 * Estado del borrador que el paso contenedor necesita conocer para decidir si
 * habilita "Siguiente" y qué avisar al intentar avanzar.
 */
export type ManualRepairDraftState = {
  /** Hay un borrador válido: se puede agregar solo al avanzar */
  canAdd: boolean;
  /** Hay trabajo cargado (fotos/descripción) sin título: no se puede agregar */
  hasOrphanContent: boolean;
};

/**
 * API imperativa para el paso que contiene este input.
 *
 * El borrador (tarea elegida, texto libre, descripcion, fotos) vive dentro de este
 * componente, asi que el wizard no puede saber si quedo algo escrito sin agregar.
 * Al avanzar de paso llama a `commitPendingDraft()`: si hay un borrador valido lo
 * agrega solo — antes se descartaba en silencio y el usuario perdia la reparacion.
 */
export type ManualRepairsInputHandle = {
  commitPendingDraft: () => PendingDraftCommit;
};
