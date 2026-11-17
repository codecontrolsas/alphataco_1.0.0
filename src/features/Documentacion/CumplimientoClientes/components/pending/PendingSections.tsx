import { Card, CardContent } from '@/components/ui/card';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { loadExpiryCalendar, loadPendingDocuments } from '../../lib/pending.server';
import { ExpiryCalendarClient } from './ExpiryCalendarClient';
import { PendingDocumentsClient } from './PendingDocumentsClient';

const noPermission = (
  <StateBlock
    variant="noperm"
    title="No tenés permiso para ver esta información"
    description="Pedile a un administrador acceso a las listas de documentos de personal o de equipos."
  />
);

export async function PendingDocumentsSection() {
  const data = await loadPendingDocuments();
  if (data.visibleTabs.length === 0) return noPermission;
  return (
    <Card>
      <CardContent>
        <PendingDocumentsClient data={data} />
      </CardContent>
    </Card>
  );
}

export async function ExpiryCalendarSection() {
  const data = await loadExpiryCalendar();
  if (data.visibleTabs.length === 0) return noPermission;
  return (
    <Card>
      <CardContent>
        <ExpiryCalendarClient data={data} />
      </CardContent>
    </Card>
  );
}
