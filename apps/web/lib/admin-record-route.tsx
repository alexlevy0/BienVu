import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { EntityId } from '@bienvu/contracts';
import { requireAdmin } from './admin-access';
import { RequestFailure } from './http';
import { StudioFrame } from '../components/studio-frame';
import { AdminRecordPage } from '../components/admin-record-page';

export async function adminRecordRoute(kind: 'video' | 'agency', id: string) {
  if (!EntityId.safeParse(id).success) notFound();
  const { env } = await getCloudflareContext({ async: true });
  try {
    await requireAdmin(new Request(env.BETTER_AUTH_URL + '/admin', { headers: await headers() }), env);
  } catch (e) {
    if (e instanceof RequestFailure) {
      if (e.code === 'UNAUTHORIZED') redirect('/connexion');
      notFound();
    }
    throw e;
  }
  return (
    <StudioFrame active="admin" showFooter={false}>
      <AdminRecordPage kind={kind} id={id} />
    </StudioFrame>
  );
}
