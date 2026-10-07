import {getCloudflareContext} from '@opennextjs/cloudflare';
import {findMapImage,mapHash} from '@bienvu/maps';
import {RequestFailure,respond} from '../../../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){return respond(async()=>{
  const {id}=await context.params,env=(await getCloudflareContext({async:true})).env,row=await findMapImage(env.DB,id);
  if(row?.state!=='ready'||!row.objectKey||!row.sha256||!row.sizeBytes||!row.mime)throw new RequestFailure('NOT_FOUND');
  // This endpoint exposes only a cached IGN base map, without pins, labels or client data.
  const object=await env.MEDIA.get(row.objectKey);if(!object||object.size!==row.sizeBytes||object.size>8*1024*1024)throw new RequestFailure('NOT_FOUND');
  const bytes=new Uint8Array(await object.arrayBuffer());if(await mapHash(bytes)!==row.sha256)throw new RequestFailure('MAP_UNAVAILABLE');
  return new Response(bytes.buffer,{headers:{'Content-Type':row.mime}});
});}
