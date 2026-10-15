import type { certification_status } from '@/generated/prisma/enums';
import { CERTIFICATION_STATUS_UI } from '../../lib/status-presentation';
import { ComercialStatusPill } from '../../shared/components/ComercialStatusPill';

export function CertificationStatusBadge({ status }: { status: certification_status }) {
  return <ComercialStatusPill ui={CERTIFICATION_STATUS_UI[status]} />;
}
