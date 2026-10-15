/** Credenciales recién generadas (alta o rotación). */
export type CreatedExternalApiClient = {
  id: string;
  name: string;
  clientId: string;
  /** Se muestra una unica vez: no vuelve a estar disponible */
  secret: string;
};
