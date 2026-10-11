/**
 * Claves de React Query de Tesorería. Las tablas corren en client-side mode: después de mutar hay
 * que invalidarlas (un `router.refresh()` solo no las actualiza).
 */
export const TREASURY_QUERY_KEYS = {
  movements: ['treasury-movements'],
  transfers: ['treasury-transfers'],
  statement: ['treasury-statement'],
  balanceOn: ['treasury-balance-on'],
  receivables: ['treasury-receivables'],
  receipts: ['treasury-receipts'],
  withholdings: ['treasury-withholdings'],
  customerStatement: ['treasury-customer-statement'],
  receiptForm: ['treasury-receipt-form'],
  checks: ['treasury-checks'],
  checkDetail: ['treasury-check-detail'],
  checksHeader: ['treasury-checks-header'],
  checkOperationForm: ['treasury-check-operation-form'],
} as const;
