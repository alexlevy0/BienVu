import {EmailRequest} from '@bienvu/contracts';
import {createAuth,type AuthEnvironment} from './auth';
import {RequestFailure} from './http';
export type AdminIdentity={id:string;email:string;emailVerified:boolean};
export function isSuperAdmin(env:{SUPER_ADMIN_EMAIL?:string},user:AdminIdentity|null|undefined){
  const configured=env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(configured&&EmailRequest.safeParse({email:configured}).success&&user?.emailVerified===true&&user.email.trim().toLowerCase()===configured);
}
export async function requireAdmin(request:Request,env:AuthEnvironment&{SUPER_ADMIN_EMAIL?:string}){
  const session=await createAuth(env).api.getSession({headers:request.headers});
  if(!session?.user.emailVerified)throw new RequestFailure('UNAUTHORIZED');
  if(!isSuperAdmin(env,session.user))throw new RequestFailure('FORBIDDEN');
  return session.user;
}
