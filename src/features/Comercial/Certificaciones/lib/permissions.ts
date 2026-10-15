/** Permisos de certificaciones que el servidor resuelve una vez y pasa a la tabla y al detalle. */
export interface CertificationPermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canApprove: boolean;
  canDelete: boolean;
  canViewPrices: boolean;
}
