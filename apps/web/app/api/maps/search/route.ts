import {getCloudflareContext} from '@opennextjs/cloudflare';
import {MapSearch} from '@bienvu/contracts';
import {geocodeMap} from '@bienvu/maps';
import {boundedJson,RequestFailure,respond} from '../../../../lib/http';
import {authorizeMapRequest,mapAction} from '../../../../lib/maps';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(()=>mapAction(async()=>{
  const env=(await getCloudflareContext({async:true})).env;
  await authorizeMapRequest(request,env);
  const input=MapSearch.safeParse(await boundedJson(request));if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
  return Response.json({locations:await geocodeMap(input.data.query)});
}));}
