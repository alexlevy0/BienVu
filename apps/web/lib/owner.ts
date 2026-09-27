import {getCloudflareContext} from '@opennextjs/cloudflare';
import {ensureAgency} from '@bienvu/db';
import {createAuth} from './auth';
import {RequestFailure} from './http';

export async function requireOwner(request: Request) {
  const {env} = await getCloudflareContext({async: true});
  const session = await createAuth(env).api.getSession({headers: request.headers});
  if (!session?.user.emailVerified) throw new RequestFailure('UNAUTHORIZED');
  const agency = await ensureAgency(env.DB, session.user);
  return {env, agency, user: session.user};
}
