import { Card, CardContent } from '@/components/ui/card';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getVisibleFitKinds } from '../../lib/customer-compliance.server';
import { DocumentAuditClient } from './DocumentAuditClient';

export async function DocumentAuditSection() {
  const kinds = await getVisibleFitKinds();
  if (kinds.length === 0) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver esta información"
        description="Pedile a un administrador acceso a la documentación de personal o de equipos."
      />
    );
  }
  return (
    <Card>
      <CardContent>
        <DocumentAuditClient kinds={kinds} />
      </CardContent>
    </Card>
  );
}
