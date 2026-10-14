export interface PipelineStep {
  id: string;
  stepNumber: number;
  label: string;
  description: string;
  iconName: string;
  /** Slug de la tab del módulo `mantenimiento` cuyo `view` habilita el paso. */
  permissionTab?: string;
}

export type PipelineCounts = Record<string, number>;
