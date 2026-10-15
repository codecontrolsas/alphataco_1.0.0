export interface PipelineStep {
  id: string;
  stepNumber: number;
  label: string;
  description: string;
  iconName: string;
  /** Slug de la tab del módulo `mantenimiento` cuyo `view` habilita el paso. */
  permissionTab?: string;
}

/** Pendientes por paso. `null` = no se pudo calcular (la UI muestra "—", nunca un 0 inventado). */
export type PipelineCounts = Record<string, number | null>;

/** Lo que muestra la cabecera del pipeline: contadores y texto de atención por paso. */
export interface PipelineSummary {
  counts: PipelineCounts;
  /** Texto de atención por paso; `null` o ausente = nada que avisar. */
  attention: Record<string, string | null>;
}
