import {getCloudflareContext} from '@opennextjs/cloudflare';
import {ensureAgency,memberAgency,type AgencyRole} from '@bienvu/db';
import {canAgencyAction} from '@bienvu/contracts';
import {createAuth} from './auth';
import {RequestFailure} from './http';

export async function requireOwner(request: Request) {
  const {env} = await getCloudflareContext({async: true});
  const session = await createAuth(env).api.getSession({headers: request.headers});
  if (!session?.user.emailVerified) throw new RequestFailure('UNAUTHORIZED');
  const personal = await ensureAgency(env.DB, session.user);
  await env.DB.prepare("INSERT INTO agency_members SELECT ?,?,'owner',? WHERE NOT EXISTS(SELECT 1 FROM agency_members WHERE agency_id=? AND user_id=?)").bind(personal.id,session.user.id,new Date().toISOString(),personal.id,session.user.id).run();
  const selected=/\bbienvu_agency=([a-zA-Z0-9_-]{1,128})(?:;|$)/.exec(request.headers.get('cookie')??'')?.[1];
  const membership=selected?await memberAgency(env.DB,session.user.id,selected):null;
  const agency=membership?.agency??personal,role:AgencyRole=membership?.role??'owner';
  if(!canAgencyAction(role,request.method,new URL(request.url).pathname))throw new RequestFailure('FORBIDDEN');
  return {env, agency, role, user: session.user};
}
