import {getCloudflareContext} from '@opennextjs/cloudflare';
import {findMapImage,mapHash} from '@bienvu/maps';
import {RequestFailure,respond} from '../../../../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){return respond(async()=>{
  const {id}=await context.params,env=(await getCloudflareContext({async:true})).env,row=await findMapImage(env.DB,id);
  if(row?.state!=='ready'||!row.buildingsKey||!row.buildingsSha256||!row.buildingsSize)throw new RequestFailure('NOT_FOUND');
  const object=await env.MEDIA.get(row.buildingsKey);
  if(!object||object.size!==row.buildingsSize||object.size>4*1024*1024)throw new RequestFailure('NOT_FOUND');
  const bytes=new Uint8Array(await object.arrayBuffer());if(await mapHash(bytes)!==row.buildingsSha256)throw new RequestFailure('MAP_UNAVAILABLE');
  return new Response(bytes.buffer,{headers:{'Content-Type':'application/json'}});
});}
