import { DailyReportAttentionBanner } from './components/DailyReportAttentionBanner';
import { getCachedDailyReportHeader } from './lib/header-cache';
import { toReportDateString } from './lib/report-date';

/** Resuelve la fecha del parte (server) y monta el aviso, que es cliente porque lee queries. */
export async function DailyReportAttentionSection({ uuid }: { uuid: string }) {
  const header = await getCachedDailyReportHeader(uuid);
  if (!header) return null;

  return <DailyReportAttentionBanner dailyReportId={uuid} reportDate={toReportDateString(header.date)} />;
}
