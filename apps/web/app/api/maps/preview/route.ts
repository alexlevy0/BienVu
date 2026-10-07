import {getCloudflareContext} from '@opennextjs/cloudflare';
import {MapPreviewRequest} from '@bienvu/contracts';
import {prepareMapImage} from '@bienvu/maps';
import {boundedJson,RequestFailure,respond} from '../../../../lib/http';
import {authorizeMapRequest,mapAction} from '../../../../lib/maps';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(()=>mapAction(async()=>{
  const env=(await getCloudflareContext({async:true})).env;await authorizeMapRequest(request,env);
  const input=MapPreviewRequest.safeParse(await boundedJson(request));if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
  const image=await prepareMapImage(env,input.data.location,input.data.aspectRatio,fetch,input.data.view,{zoomStart:input.data.zoomStart,zoomEnd:input.data.zoomEnd});return Response.json(image.info);
}));}
