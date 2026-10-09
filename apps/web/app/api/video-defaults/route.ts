import {getCloudflareContext} from '@opennextjs/cloudflare';
import {videoMapSettings} from '@bienvu/db';
import {respond} from '../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(){return respond(async()=>{
  const env=(await getCloudflareContext({async:true})).env;
  return Response.json((await videoMapSettings(env.DB)).settings,{headers:{'Cache-Control':'no-store'}});
});}
