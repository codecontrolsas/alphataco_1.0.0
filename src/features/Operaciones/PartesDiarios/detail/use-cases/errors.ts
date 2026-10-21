/**
 * Códigos de error estables de los casos de uso del parte diario. La app y la web leen el CÓDIGO; el mensaje
 * (en español) es para mostrar. No cambiar ni reutilizar un código existente: es parte del contrato.
 */
export type RowErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'ROW_IN_CERTIFICATION'
  | 'ROW_EXECUTED_PAST'
  | 'REPORT_CLOSED'
  | 'RESOURCE_INACTIVE'
  | 'VERSION_CONFLICT'
  | 'COMMAND_ID_REUSED';

/** Regla de negocio incumplida (permiso, estado de la línea o del parte, versión). */
export class RowRuleError extends Error {
  readonly code: RowErrorCode;
  /** Solo en `VERSION_CONFLICT`: la versión vigente de la línea. */
  readonly currentVersion?: number;

  constructor(message: string, code: RowErrorCode = 'INVALID_INPUT', currentVersion?: number) {
    super(message);
    this.name = 'RowRuleError';
    this.code = code;
    this.currentVersion = currentVersion;
  }
}
