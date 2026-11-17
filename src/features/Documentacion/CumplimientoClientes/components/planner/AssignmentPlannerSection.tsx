import { Card, CardContent } from '@/components/ui/card';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getVisibleFitKinds, loadPlannerOptions, todayWindow } from '../../lib/customer-compliance.server';
import { AssignmentPlannerClient } from './AssignmentPlannerClient';

export async function AssignmentPlannerSection({ initialCustomerId }: { initialCustomerId: string | null }) {
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

  const options = await loadPlannerOptions(companyId, kinds);
  return (
    <Card>
      <CardContent>
        <AssignmentPlannerClient
          options={options}
          kinds={kinds}
          today={todayWindow().from}
          initialCustomerId={options.customers.some((c) => c.id === initialCustomerId) ? initialCustomerId : null}
        />
      </CardContent>
    </Card>
  );
}
