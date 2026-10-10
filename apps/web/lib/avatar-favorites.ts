import {AvatarFavoriteUpdate} from '@bienvu/contracts';
import {avatarFavorites,setAvatarFavorite} from '@bienvu/db';
import {createAuth,type AuthEnvironment} from './auth';
import {assertSameOrigin,boundedJson,respond,RequestFailure} from './http';

export async function avatarFavoritesRequest(request:Request,env:AuthEnvironment){return respond(async()=>{
  const session=await createAuth(env).api.getSession({headers:request.headers});
  if(!session?.user.emailVerified)throw new RequestFailure('UNAUTHORIZED');
  if(request.method==='GET')return Response.json(await avatarFavorites(env.DB,session.user.id));
  if(request.method!=='PUT')throw new RequestFailure('VALIDATION_ERROR');
  assertSameOrigin(request,env);
  const input=AvatarFavoriteUpdate.safeParse(await boundedJson(request,1024));
  if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
  try{await setAvatarFavorite(env.DB,session.user.id,input.data);}
  catch(error){if(error instanceof Error&&error.message==='AVATAR_UNAVAILABLE')throw new RequestFailure('AVATAR_UNAVAILABLE');throw error;}
  return Response.json(input.data);
});}
