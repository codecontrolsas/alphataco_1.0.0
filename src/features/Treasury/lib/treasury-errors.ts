/**
 * Error de negocio de Tesorería: el mensaje es para el usuario y la action lo devuelve tal cual en
 * el `ActionResult`. Módulo sin directiva (lo importan libs y actions, también las de Compras).
 */
export class TreasuryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreasuryError';
  }
}
