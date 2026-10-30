import { getMyHseNotices } from '@/features/Portal/actions/hse-notices.queries';
import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import { argentinaDate, formatDateAr } from '@/shared/lib/argentina-time';
import moment from 'moment';
import { PortalNoticesBell } from './PortalNoticesBell';

/** Lee los avisos del empleado (la misma consulta memoizada que usa el inicio) y arma la campana. */
export async function PortalNoticesBellAsync({ employee }: { employee: PortalEmployee }) {
  const notices = await getMyHseNotices(employee);
  const today = moment(argentinaDate(), 'YYYY-MM-DD');
  return (
    <PortalNoticesBell
      notices={notices.map((n) => ({
        id: n.id,
        kind: n.kind === 'training' ? 'training' : 'document',
        title: n.title,
        dueText: formatDateAr(n.dueOn),
        daysLeft: moment(n.dueOn, 'YYYY-MM-DD').diff(today, 'days'),
        href: n.href,
      }))}
    />
  );
}
