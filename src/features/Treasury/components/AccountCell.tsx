import { StackedCell } from '@/shared/components/common/StackedCell';
import { TREASURY_ACCOUNT_KIND_LABELS } from '../schemas/accounts';

interface AccountCellProps {
  account: { name: string; kind: keyof typeof TREASURY_ACCOUNT_KIND_LABELS; bankName: string | null };
}

/** Cuenta de tesorería en dos líneas: nombre y, debajo, el banco (o el tipo de cuenta si no tiene). */
export function AccountCell({ account }: AccountCellProps) {
  return <StackedCell primary={account.name} secondary={account.bankName ?? TREASURY_ACCOUNT_KIND_LABELS[account.kind]} />;
}
