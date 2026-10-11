import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin,boundedBytes,respond,RequestFailure} from '../../../../lib/http';
import {showcaseLimit} from '@bienvu/db';
import {ensureShowcase,uploadShowcaseImage} from '../../../../lib/showcases';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{const{env,agency,role}=await requireOwner(request);assertSameOrigin(request,env);
  if(!['owner','admin'].includes(role))throw new RequestFailure('FORBIDDEN');const kind=new URL(request.url).searchParams.get('kind');if(kind!=='logo'&&kind!=='cover')throw new RequestFailure('VALIDATION_ERROR');
  if(!await showcaseLimit(env.DB,'upload:'+agency.id,6,60000))throw new RequestFailure('RATE_LIMITED');await ensureShowcase(env,agency);
  const asset=await uploadShowcaseImage(env,agency.id,await boundedBytes(request,2*1024*1024),request.headers.get('content-type')?.split(';')[0]??'',kind);return Response.json({asset:{...asset,url:`/api/vitrine/assets/${asset.id}`}},{status:201});});}
