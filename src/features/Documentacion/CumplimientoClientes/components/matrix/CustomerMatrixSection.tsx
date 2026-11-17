import { Card, CardContent } from '@/components/ui/card';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getVisibleFitKinds, loadCustomerMatrix } from '../../lib/customer-compliance.server';
import { CustomerMatrixClient } from './CustomerMatrixClient';

export async function CustomerMatrixSection({ initialCustomerId }: { initialCustomerId: string | null }) {
  const [kinds, companyId] = await Promise.all([getVisibleFitKinds(), getActiveCompanyId()]);
  if (kinds.length === 0) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver esta información"
        description="Pedile a un administrador acceso a la documentación de personal o de equipos."
      />
    );
  }

  const matrix = await loadCustomerMatrix(companyId, kinds);
  return (
    <Card>
      <CardContent>
        <CustomerMatrixClient matrix={matrix} kinds={kinds} initialCustomerId={initialCustomerId} />
      </CardContent>
    </Card>
  );
}
