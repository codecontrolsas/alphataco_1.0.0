import { Suspense } from 'react';
import type { getCheckbooks } from '../../actions/own-checks.server';
import { AttentionSkeleton } from '../../components/AttentionSkeleton';
import { HeaderLoadError } from '../../components/HeaderLoadError';
import { CheckbooksCard } from './CheckbooksCard';

type Can = { create: boolean; retire: boolean };

async function Checkbooks({ checkbooks, can }: { checkbooks: Promise<Awaited<ReturnType<typeof getCheckbooks>> | null>; can: Can }) {
  const data = await checkbooks;
  return data ? <CheckbooksCard checkbooks={data} can={can} /> : <HeaderLoadError what="las chequeras" />;
}

/** Server Component: las chequeras se resuelven en su propio Suspense, sin frenar la tabla. */
export function CheckbooksSection(props: { checkbooks: Promise<Awaited<ReturnType<typeof getCheckbooks>> | null>; can: Can }) {
  return (
    <Suspense fallback={<AttentionSkeleton />}>
      <Checkbooks {...props} />
    </Suspense>
  );
}
