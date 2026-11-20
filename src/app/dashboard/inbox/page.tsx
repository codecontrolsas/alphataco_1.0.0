import { companyPageMetadata } from '@/app/_lib/company-metadata';
import { InboxPageContent } from '@/features/Inbox/InboxPageContent';

export async function generateMetadata() {
  return companyPageMetadata('Mi bandeja', (name) => `Decisiones pendientes de ${name}`);
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <InboxPageContent searchParams={resolvedSearchParams} />;
}
